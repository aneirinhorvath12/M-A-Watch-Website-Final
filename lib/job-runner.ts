import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/bootstrap";
import {
  MAX_ARTICLE_BODY_BYTES,
  validateArticleBlocks,
} from "@/lib/article-block-validation";
import type { EmailJob } from "@/lib/email-queue";
import { validatedIntegrationUrl } from "@/lib/integration-security";
import {
  JOB_LEASE_MS,
  JOB_MAX_ATTEMPTS,
  JOB_REQUEST_TIMEOUT_MS,
  jobIdempotencyKey,
  jobRetryDelayMs,
} from "@/lib/job-policy";
import { createId, database, privateFiles, safeJson } from "@/lib/platform";
import { MAX_PARSE_WARNINGS_BYTES } from "@/lib/publication-revision-validation";
import { publicationSearchText } from "@/lib/publication-search-text";
import type { ArticleBlock } from "@/lib/publications/types";
import { utf8ByteLength } from "@/lib/text-limits";

const INTEGRATION_JOB_TYPES = [
  "email",
  "file_scan",
  "publication_parse",
] as const;
type IntegrationJobType = (typeof INTEGRATION_JOB_TYPES)[number];
type RuntimeSecrets = {
  EMAIL_WEBHOOK_URL?: string;
  EMAIL_WEBHOOK_TOKEN?: string;
  MALWARE_SCAN_WEBHOOK_URL?: string;
  MALWARE_SCAN_WEBHOOK_TOKEN?: string;
  PARSER_WEBHOOK_URL?: string;
  PARSER_WEBHOOK_TOKEN?: string;
};

type JobRow = {
  id: string;
  type: string;
  payload: string;
  attempts: number;
};

type StoredFilePayload = {
  key?: unknown;
  applicationId?: unknown;
  publicationId?: unknown;
  replacement?: unknown;
  expectedPublicationUpdatedAt?: unknown;
};

type ParserWebhookResult = {
  status: "draft" | "parse-failed";
  publicationId: string;
  parserVersion: string;
  blocks: ArticleBlock[];
  warnings: unknown[];
  metadata: Record<string, unknown>;
  error?: string;
};

type InvocationResult =
  | { kind: "email" }
  | { kind: "file_scan"; payload: StoredFilePayload }
  | {
      kind: "publication_parse";
      payload: StoredFilePayload;
      result: ParserWebhookResult;
    };

type IntegrationConfig = { endpoint: string; token?: string };

export type JobRunSummary = {
  scheduledPublished: number;
  staleRecovered: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  awaitingConfiguration: number;
};

class PermanentJobError extends Error {}

const MAX_PARSE_METADATA_BYTES = 64_000;

export async function runMaintenance(limit = 5): Promise<JobRunSummary> {
  await ensureDatabase();
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 10));
  const now = Date.now();
  const secrets = env as unknown as RuntimeSecrets;
  const staleRecovered = await recoverStaleJobs(now);
  const scheduledPublished = await publishDueItems(now, boundedLimit);
  const configuredTypes = INTEGRATION_JOB_TYPES.filter((type) =>
    Boolean(integrationFor(type, secrets)?.endpoint),
  );
  const awaitingConfiguration = await countAwaitingConfiguration(
    now,
    configuredTypes,
  );
  const rows = await processableJobs(now, boundedLimit, configuredTypes);

  const summary: JobRunSummary = {
    scheduledPublished,
    staleRecovered,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    awaitingConfiguration,
  };

  for (const job of rows) {
    const result = await processJob(job, secrets);
    if (result === "skipped") {
      summary.skipped += 1;
      continue;
    }
    summary.processed += 1;
    if (result === "succeeded") summary.succeeded += 1;
    else summary.failed += 1;
  }
  return summary;
}

async function recoverStaleJobs(now: number): Promise<number> {
  const result = await database()
    .prepare(
      `UPDATE background_jobs
       SET status = 'queued', error = 'The previous worker lease expired; retrying.',
           run_after = ?, updated_at = ?
       WHERE status = 'running' AND updated_at <= ?`,
    )
    .bind(now, now, now - JOB_LEASE_MS)
    .run();
  return result.meta.changes ?? 0;
}

async function publishDueItems(now: number, limit: number): Promise<number> {
  const due = await database()
    .prepare(
      `SELECT id FROM publications
       WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?
       ORDER BY scheduled_at ASC LIMIT ?`,
    )
    .bind(now, limit)
    .all<{ id: string }>();

  let published = 0;
  for (const row of due.results) {
    const auditId = createId("audit");
    const results = await database().batch([
      database()
        .prepare(
          `UPDATE publications
           SET status = 'published', published_at = ?, updated_at = ?
           WHERE id = ? AND status = 'scheduled' AND scheduled_at <= ?`,
        )
        .bind(now, now, row.id, now),
      database()
        .prepare(
          `INSERT INTO audit_log
           (id, actor_id, action, entity_type, entity_id, metadata, created_at)
           SELECT ?, NULL, 'publication.scheduled_publish', 'publication', id,
                  '{"source":"maintenance"}', ?
           FROM publications
           WHERE id = ? AND status = 'published' AND published_at = ?
             AND NOT EXISTS (
               SELECT 1 FROM audit_log
               WHERE action = 'publication.scheduled_publish'
                 AND entity_id = ? AND created_at = ?
             )`,
        )
        .bind(auditId, now, row.id, now, row.id, now),
    ]);
    if ((results[0].meta.changes ?? 0) === 1) published += 1;
  }
  return published;
}

async function countAwaitingConfiguration(
  now: number,
  configuredTypes: readonly IntegrationJobType[],
): Promise<number> {
  const missingTypes = INTEGRATION_JOB_TYPES.filter(
    (type) => !configuredTypes.includes(type),
  );
  if (!missingTypes.length) return 0;
  const placeholders = missingTypes.map(() => "?").join(", ");
  const row = await database()
    .prepare(
      `SELECT COUNT(*) AS count FROM background_jobs
       WHERE status = 'queued' AND run_after <= ? AND type IN (${placeholders})`,
    )
    .bind(now, ...missingTypes)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

async function processableJobs(
  now: number,
  limit: number,
  configuredTypes: readonly IntegrationJobType[],
): Promise<JobRow[]> {
  const knownTypes = INTEGRATION_JOB_TYPES.map((type) => `'${type}'`).join(", ");
  const configuredPredicates = configuredTypes.map(() => "type = ?");
  const typePredicate = [
    `type NOT IN (${knownTypes})`,
    ...configuredPredicates,
  ].join(" OR ");
  const rows = await database()
    .prepare(
      `SELECT id, type, payload, attempts FROM background_jobs
       WHERE status = 'queued' AND run_after <= ? AND (${typePredicate})
       ORDER BY created_at ASC LIMIT ?`,
    )
    .bind(now, ...configuredTypes, limit)
    .all<JobRow>();
  return rows.results;
}

async function processJob(
  job: JobRow,
  secrets: RuntimeSecrets,
): Promise<"succeeded" | "failed" | "skipped"> {
  const claimedAt = Date.now();
  const claim = await database()
    .prepare(
      `UPDATE background_jobs
       SET status = 'running', attempts = attempts + 1, error = NULL, updated_at = ?
       WHERE id = ? AND status = 'queued' AND run_after <= ?`,
    )
    .bind(claimedAt, job.id, claimedAt)
    .run();
  if ((claim.meta.changes ?? 0) !== 1) return "skipped";

  const attempt = job.attempts + 1;
  try {
    if (!isIntegrationJobType(job.type)) {
      throw new PermanentJobError("Unsupported background job type.");
    }
    const integration = integrationFor(job.type, secrets);
    if (!integration?.endpoint) {
      throw new Error("The integration is not configured.");
    }
    const result = await invokeIntegration(job, integration);
    await finishSuccessfulJob(job, result);
    return "succeeded";
  } catch (error) {
    await finishFailedJob(job, attempt, error);
    return "failed";
  }
}

function isIntegrationJobType(value: string): value is IntegrationJobType {
  return (INTEGRATION_JOB_TYPES as readonly string[]).includes(value);
}

function integrationFor(
  type: IntegrationJobType,
  secrets: RuntimeSecrets,
): IntegrationConfig | null {
  if (type === "email") {
    return secrets.EMAIL_WEBHOOK_URL
      ? { endpoint: secrets.EMAIL_WEBHOOK_URL, token: secrets.EMAIL_WEBHOOK_TOKEN }
      : null;
  }
  if (type === "file_scan") {
    return secrets.MALWARE_SCAN_WEBHOOK_URL
      ? {
          endpoint: secrets.MALWARE_SCAN_WEBHOOK_URL,
          token: secrets.MALWARE_SCAN_WEBHOOK_TOKEN,
        }
      : null;
  }
  return secrets.PARSER_WEBHOOK_URL
    ? { endpoint: secrets.PARSER_WEBHOOK_URL, token: secrets.PARSER_WEBHOOK_TOKEN }
    : null;
}

async function invokeIntegration(
  job: JobRow,
  integration: IntegrationConfig,
): Promise<InvocationResult> {
  const endpoint = validatedIntegrationUrl(integration.endpoint, {
    allowLoopbackHttp: process.env.NODE_ENV === "development",
  });
  if (!endpoint) {
    throw new PermanentJobError(
      "The integration URL must use HTTPS (loopback HTTP is allowed only in development).",
    );
  }
  const baseHeaders: Record<string, string> = {
    "idempotency-key": jobIdempotencyKey(job),
    "x-ma-watch-job-id": job.id,
    "x-ma-watch-job-type": job.type,
    ...(integration.token
      ? { authorization: `Bearer ${integration.token}` }
      : {}),
  };

  if (job.type === "email") {
    const emailJob = safeJson<EmailJob | null>(job.payload, null);
    if (!emailJob) throw new PermanentJobError("The email job payload is invalid.");
    const body = buildEmailPayload(emailJob);
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { ...baseHeaders, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assertSuccessfulResponse(response);
    return { kind: "email" };
  }

  if (job.type !== "file_scan" && job.type !== "publication_parse") {
    throw new PermanentJobError("Unsupported background job type.");
  }

  const payload = safeJson<StoredFilePayload | null>(job.payload, null);
  if (!payload) throw new PermanentJobError("The stored-file job payload is invalid.");
  const key = storedFileKey(payload, job.type);
  const object = await privateFiles().get(key);
  if (!object) throw new PermanentJobError("The stored PDF is unavailable.");
  const bytes = await object.arrayBuffer();
  const resourceId =
    stringField(payload.publicationId) ?? stringField(payload.applicationId);
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      ...baseHeaders,
      "content-type": object.httpMetadata?.contentType ?? "application/pdf",
      ...(resourceId ? { "x-ma-watch-resource-id": resourceId } : {}),
    },
    body: bytes,
  });
  assertSuccessfulResponse(response);

  if (job.type === "file_scan") {
    const result = await readJsonObject(response);
    const status = stringField(result.status)?.toLowerCase();
    if (["infected", "malicious", "rejected", "unsafe"].includes(status ?? "")) {
      throw new PermanentJobError("The malware scanner rejected the PDF.");
    }
    if (status !== "clean") {
      throw new Error("The malware scanner did not return an explicit clean result.");
    }
    return { kind: "file_scan", payload };
  }

  const result = normaliseParserResult(await readJsonObject(response), payload);
  return { kind: "publication_parse", payload, result };
}

async function fetchWithTimeout(
  endpoint: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JOB_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(endpoint, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function assertSuccessfulResponse(response: Response): void {
  if (!response.ok) {
    throw new Error(`The integration returned HTTP ${response.status}.`);
  }
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new Error("The integration returned an invalid JSON response.");
  }
}

function storedFileKey(
  payload: StoredFilePayload | null,
  type: "file_scan" | "publication_parse",
): string {
  const key = stringField(payload?.key);
  const allowed =
    type === "publication_parse"
      ? key?.startsWith("private/publications/")
      : key?.startsWith("private/publications/") ||
        key?.startsWith("private/applicants/");
  if (!key || !allowed) throw new PermanentJobError("The stored-file job payload is invalid.");
  return key;
}

function normaliseParserResult(
  value: Record<string, unknown>,
  payload: StoredFilePayload,
): ParserWebhookResult {
  const publicationId = stringField(payload.publicationId);
  const responsePublicationId = stringField(value.publicationId);
  const status = stringField(value.status);
  const parserVersion = stringField(value.parserVersion);
  if (
    !publicationId ||
    responsePublicationId !== publicationId ||
    (status !== "draft" && status !== "parse-failed") ||
    !parserVersion
  ) {
    throw new Error("The parser response does not match the requested publication.");
  }

  const rawBlocks = Array.isArray(value.blocks) ? value.blocks : [];
  const blocks: unknown[] = rawBlocks.map((entry) => {
    const candidate =
      entry && typeof entry === "object" && !Array.isArray(entry) && "block" in entry
        ? (entry as { block: unknown }).block
        : entry;
    return candidate;
  });
  const serialisedBlocks = JSON.stringify(blocks);
  if (utf8ByteLength(serialisedBlocks) > MAX_ARTICLE_BODY_BYTES) {
    throw new PermanentJobError("The parser output exceeds the article size limit.");
  }
  if (!validateArticleBlocks(blocks)) {
    throw new Error("The parser returned an unsafe or malformed article block.");
  }

  const warnings = Array.isArray(value.warnings) ? value.warnings : [];
  const metadata =
    value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
      ? (value.metadata as Record<string, unknown>)
      : {};
  jsonWithinByteLimit(warnings, MAX_PARSE_WARNINGS_BYTES, "parser warnings");
  jsonWithinByteLimit(metadata, MAX_PARSE_METADATA_BYTES, "parser metadata");
  return {
    status,
    publicationId,
    parserVersion: parserVersion.slice(0, 120),
    blocks,
    warnings,
    metadata,
    error: stringField(value.error)?.slice(0, 500),
  };
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function jsonWithinByteLimit(
  value: unknown,
  maxBytes: number,
  label: string,
): string {
  const serialised = JSON.stringify(value);
  if (utf8ByteLength(serialised) > maxBytes) {
    throw new PermanentJobError(`The ${label} exceeds its storage limit.`);
  }
  return serialised;
}

async function finishSuccessfulJob(
  job: JobRow,
  result: InvocationResult,
): Promise<void> {
  if (result.kind === "email") {
    await markJobSucceeded(job.id);
    return;
  }
  if (result.kind === "file_scan") {
    await finishFileScan(job, result.payload);
    return;
  }
  await finishPublicationParse(job, result.payload, result.result);
}

async function markJobSucceeded(id: string): Promise<void> {
  await database()
    .prepare(
      `UPDATE background_jobs
       SET status = 'succeeded', error = NULL, updated_at = ?
       WHERE id = ? AND status = 'running'`,
    )
    .bind(Date.now(), id)
    .run();
}

async function finishFileScan(job: JobRow, payload: StoredFilePayload): Promise<void> {
  const key = storedFileKey(payload, "file_scan");
  await setStoredFileScanStatus(key, "clean");
  const now = Date.now();
  const publicationId = stringField(payload.publicationId);
  const applicationId = stringField(payload.applicationId);
  const statements: D1PreparedStatement[] = [
    database()
      .prepare(
        `UPDATE background_jobs
         SET status = 'succeeded', error = NULL, updated_at = ?
         WHERE id = ? AND status = 'running'`,
      )
      .bind(now, job.id),
  ];

  if (publicationId) {
    const parseJobId = `job_parse_${job.id}`;
    const parsePayload = JSON.stringify({
      publicationId,
      key,
      replacement: payload.replacement === true,
      sourceScanJobId: job.id,
      expectedPublicationUpdatedAt: now,
    });
    statements.push(
      database()
        .prepare(
          `UPDATE publications
           SET status = CASE WHEN type = 'markets' THEN 'draft' ELSE 'parsing' END,
               parse_error = NULL, updated_at = ?
           WHERE id = ? AND source_pdf_key = ? AND status = 'uploaded'`,
        )
        .bind(now, publicationId, key),
      database()
        .prepare(
          `INSERT OR IGNORE INTO background_jobs
           (id, type, status, payload, attempts, run_after, created_at, updated_at)
           SELECT ?, 'publication_parse', 'queued', ?, 0, ?, ?, ?
           FROM publications
           WHERE id = ? AND source_pdf_key = ? AND type IN ('strategic', 'legal')`,
        )
        .bind(
          parseJobId,
          parsePayload,
          now,
          now,
          now,
          publicationId,
          key,
        ),
      database()
        .prepare(
          `INSERT INTO audit_log
           (id, actor_id, action, entity_type, entity_id, metadata, created_at)
           SELECT ?, NULL, 'publication.file_scan_succeeded', 'publication', id, ?, ?
           FROM publications WHERE id = ? AND source_pdf_key = ?`,
        )
        .bind(
          createId("audit"),
          JSON.stringify({ jobId: job.id }),
          now,
          publicationId,
          key,
        ),
    );
  } else if (applicationId) {
    statements.push(
      database()
        .prepare(
          `UPDATE applicants SET updated_at = ? WHERE id = ? AND cv_key = ?`,
        )
        .bind(now, applicationId, key),
      database()
        .prepare(
          `INSERT INTO audit_log
           (id, actor_id, action, entity_type, entity_id, metadata, created_at)
           SELECT ?, NULL, 'application.file_scan_succeeded', 'applicant', id, ?, ?
           FROM applicants WHERE id = ? AND cv_key = ?`,
        )
        .bind(
          createId("audit"),
          JSON.stringify({ jobId: job.id }),
          now,
          applicationId,
          key,
        ),
    );
  } else {
    throw new PermanentJobError("The file scan is not linked to a record.");
  }
  await database().batch(statements);
}

async function setStoredFileScanStatus(
  key: string,
  status: "clean" | "rejected",
): Promise<void> {
  const bucket = privateFiles();
  const current = await bucket.get(key);
  if (!current) throw new PermanentJobError("The stored PDF is unavailable.");
  if (current.customMetadata?.scanStatus === status) return;

  const bytes = await current.arrayBuffer();
  const written = await bucket.put(key, bytes, {
    httpMetadata: current.httpMetadata,
    customMetadata: {
      ...current.customMetadata,
      scanStatus: status,
      scanCheckedAt: new Date().toISOString(),
    },
    onlyIf: { etagMatches: current.etag },
  });
  if (written) return;
  const latest = await bucket.head(key);
  if (latest?.customMetadata?.scanStatus !== status) {
    throw new Error("The stored PDF changed while its scan result was recorded.");
  }
}

async function finishPublicationParse(
  job: JobRow,
  payload: StoredFilePayload,
  result: ParserWebhookResult,
): Promise<void> {
  const key = storedFileKey(payload, "publication_parse");
  const now = Date.now();
  const blocks = jsonWithinByteLimit(
    result.blocks,
    MAX_ARTICLE_BODY_BYTES,
    "parser article body",
  );
  const warnings = jsonWithinByteLimit(
    result.warnings,
    MAX_PARSE_WARNINGS_BYTES,
    "parser warnings",
  );
  const metadata = jsonWithinByteLimit(
    result.metadata,
    MAX_PARSE_METADATA_BYTES,
    "parser metadata",
  );
  const parseError =
    result.status === "parse-failed"
      ? result.error ?? "The parser could not produce a reliable draft."
      : null;
  const current = await database()
    .prepare(
      `SELECT status, web_body, parser_version, parse_error, search_text, updated_at
       FROM publications
       WHERE id = ? AND source_pdf_key = ? AND type IN ('strategic', 'legal')`,
    )
    .bind(result.publicationId, key)
    .first<{
      status: string;
      web_body: string;
      parser_version: string | null;
      parse_error: string | null;
      search_text: string;
      updated_at: number;
    }>();

  if (!current) {
    // A replacement won the race. Complete the stale job without allowing its
    // output to attach to the current publication or revision history.
    await markJobSucceeded(job.id);
    return;
  }

  const expectedUpdatedAt = numberField(payload.expectedPublicationUpdatedAt);
  let appliedToCurrentDraft =
    result.status === "draft"
      ? current.status === "draft" &&
        current.web_body === blocks &&
        current.parser_version === result.parserVersion
      : current.status === "parse_failed" && current.parse_error === parseError;

  if (!appliedToCurrentDraft && expectedUpdatedAt !== null) {
    const update =
      result.status === "draft"
        ? await database()
            .prepare(
              `UPDATE publications
               SET status = 'draft', web_body = ?, parser_version = ?,
                   parse_warnings = ?, parse_error = NULL, structured_metadata = ?,
                   search_text = ?, updated_at = ?
               WHERE id = ? AND source_pdf_key = ? AND type IN ('strategic', 'legal')
                 AND status = 'parsing' AND updated_at = ? AND web_body = '[]'`,
            )
            .bind(
              blocks,
              result.parserVersion,
              warnings,
              metadata,
              publicationSearchText(current.search_text, result.blocks),
              now,
              result.publicationId,
              key,
              expectedUpdatedAt,
            )
            .run()
        : await database()
            .prepare(
              `UPDATE publications
               SET status = 'parse_failed', parser_version = ?, parse_warnings = ?,
                   parse_error = ?, structured_metadata = ?, updated_at = ?
               WHERE id = ? AND source_pdf_key = ? AND type IN ('strategic', 'legal')
                 AND status = 'parsing' AND updated_at = ?`,
            )
            .bind(
              result.parserVersion,
              warnings,
              parseError,
              metadata,
              now,
              result.publicationId,
              key,
              expectedUpdatedAt,
            )
            .run();
    appliedToCurrentDraft = (update.meta.changes ?? 0) === 1;
  }

  let workflowStateUpdated = appliedToCurrentDraft;
  if (!appliedToCurrentDraft) {
    const retainedCandidateWarning = {
      code:
        result.status === "draft"
          ? "PARSER_CANDIDATE_RETAINED"
          : "PARSER_FAILED_BODY_PRESERVED",
      severity: "warning",
      message:
        result.status === "draft"
          ? "A parser candidate was retained in revision history because editorial content changed while parsing. The current article body was preserved."
          : "Parsing failed after the source changed. Existing editorial content was preserved.",
      requiresEditorialReview: true,
    };
    let workflowWarnings: string;
    try {
      workflowWarnings = jsonWithinByteLimit(
        [...result.warnings, retainedCandidateWarning],
        MAX_PARSE_WARNINGS_BYTES,
        "parser warnings",
      );
    } catch {
      // The candidate revision retains the provider warnings. The current row
      // still gets the actionable race/failure warning without exceeding D1.
      workflowWarnings = JSON.stringify([retainedCandidateWarning]);
    }
    const workflowUpdate = await database()
      .prepare(
        `UPDATE publications
         SET status = ?, parser_version = ?, parse_warnings = ?, parse_error = ?,
             structured_metadata = ?, updated_at = ?
         WHERE id = ? AND source_pdf_key = ? AND type IN ('strategic', 'legal')
           AND status = 'parsing'`,
      )
      .bind(
        result.status === "draft" ? "draft" : "parse_failed",
        result.parserVersion,
        workflowWarnings,
        parseError,
        metadata,
        now,
        result.publicationId,
        key,
      )
      .run();
    workflowStateUpdated = (workflowUpdate.meta.changes ?? 0) === 1;
  }

  const revisionId = `revision_parse_${job.id}`;
  const statements: D1PreparedStatement[] = [
    database()
      .prepare(
        `UPDATE background_jobs
         SET status = 'succeeded', error = NULL, updated_at = ?
         WHERE id = ? AND status = 'running'`,
      )
      .bind(now, job.id),
  ];

  if (result.status === "draft") {
    statements.push(
      database()
        .prepare(
          `INSERT OR IGNORE INTO publication_revisions
           (id, publication_id, revision_number, source_pdf_key, web_body,
            parse_warnings, note, created_by, created_at)
           SELECT ?, id,
             (SELECT COALESCE(MAX(revision_number), 0) + 1
              FROM publication_revisions WHERE publication_id = publications.id),
             ?, ?, ?, ?, NULL, ?
           FROM publications WHERE id = ? AND source_pdf_key = ?`,
        )
        .bind(
          revisionId,
          key,
          blocks,
          warnings,
          appliedToCurrentDraft
            ? "Parser candidate applied to the empty draft"
            : "Parser candidate retained; current editorial body preserved",
          now,
          result.publicationId,
          key,
        ),
    );
  }

  statements.push(
    database()
      .prepare(
        `INSERT INTO audit_log
         (id, actor_id, action, entity_type, entity_id, metadata, created_at)
         SELECT ?, NULL, ?, 'publication', id, ?, ?
         FROM publications WHERE id = ? AND source_pdf_key = ?`,
      )
      .bind(
        createId("audit"),
        result.status === "draft"
          ? "publication.parse_completed"
          : "publication.parse_failed",
        JSON.stringify({
          jobId: job.id,
          parserVersion: result.parserVersion,
          appliedToCurrentDraft,
          workflowStateUpdated,
          candidateRevisionId: result.status === "draft" ? revisionId : null,
        }),
        now,
        result.publicationId,
        key,
      ),
  );
  await database().batch(statements);
}

async function finishFailedJob(
  job: JobRow,
  attempts: number,
  error: unknown,
): Promise<void> {
  const terminal = error instanceof PermanentJobError || attempts >= JOB_MAX_ATTEMPTS;
  const now = Date.now();
  const message = safeJobError(error);
  const payload = safeJson<StoredFilePayload | null>(job.payload, null);
  const rawKey = stringField(payload?.key);
  const key =
    rawKey?.startsWith("private/publications/") ||
    rawKey?.startsWith("private/applicants/")
      ? rawKey
      : null;

  if (terminal && job.type === "file_scan" && key) {
    try {
      await setStoredFileScanStatus(key, "rejected");
    } catch (metadataError) {
      console.error("Unable to record the rejected file scan metadata", metadataError);
    }
  }

  const statements: D1PreparedStatement[] = [
    database()
      .prepare(
        `UPDATE background_jobs
         SET status = ?, error = ?, run_after = ?, updated_at = ?
         WHERE id = ? AND status = 'running'`,
      )
      .bind(
        terminal ? "failed" : "queued",
        message,
        now + jobRetryDelayMs(attempts),
        now,
        job.id,
      ),
  ];

  const publicationId = stringField(payload?.publicationId);
  if (terminal && publicationId && key) {
    const publicationTypePredicate =
      job.type === "file_scan" ? "" : "AND type IN ('strategic', 'legal')";
    statements.push(
      database()
        .prepare(
          `UPDATE publications
           SET status = 'parse_failed', parse_error = ?, updated_at = ?
           WHERE id = ? AND source_pdf_key = ? ${publicationTypePredicate}`,
        )
        .bind(
          job.type === "file_scan"
            ? "The source PDF did not pass the required security scan."
            : "The parser could not produce a draft after repeated attempts.",
          now,
          publicationId,
          key,
        ),
      database()
        .prepare(
          `INSERT INTO audit_log
           (id, actor_id, action, entity_type, entity_id, metadata, created_at)
           SELECT ?, NULL, ?, 'publication', id, ?, ?
           FROM publications WHERE id = ? AND source_pdf_key = ?`,
        )
        .bind(
          createId("audit"),
          job.type === "file_scan"
            ? "publication.file_scan_failed"
            : "publication.parse_failed",
          JSON.stringify({ jobId: job.id, attempts }),
          now,
          publicationId,
          key,
        ),
    );
  }

  const applicationId = stringField(payload?.applicationId);
  if (terminal && job.type === "file_scan" && applicationId && key) {
    statements.push(
      database()
        .prepare(
          `INSERT INTO audit_log
           (id, actor_id, action, entity_type, entity_id, metadata, created_at)
           SELECT ?, NULL, 'application.file_scan_failed', 'applicant', id, ?, ?
           FROM applicants WHERE id = ? AND cv_key = ?`,
        )
        .bind(
          createId("audit"),
          JSON.stringify({ jobId: job.id, attempts }),
          now,
          applicationId,
          key,
        ),
    );
  }
  await database().batch(statements);
}

function safeJobError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "The integration request timed out.";
  }
  const message = error instanceof Error ? error.message : "The background job failed.";
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

function buildEmailPayload(job: EmailJob) {
  const division = titleCase(job.data.division ?? "");
  const templates = {
    "applicant-confirmation": {
      subject: "We received your M&A Watch application",
      text: `Hello ${job.data.name},\n\nThank you for applying to M&A Watch's ${division} division. We have received your application. This confirmation does not imply acceptance.\n\nQuestions? Contact ${job.data.contactEmail ?? "hello@mawatch.org"}.`,
    },
    "new-application-admin": {
      subject: `New ${division} application — ${job.data.name}`,
      text: `${job.data.name} from ${job.data.university} submitted an application to ${division} at ${job.data.submittedAt ?? "the recorded submission time"}. Open the secure admin area at ${job.data.applicationPath ?? "/admin/applicants"} and locate application ${job.data.applicationId}.`,
    },
    "account-invitation": {
      subject: "You have been invited to administer M&A Watch",
      text: `You have been invited to the M&A Watch administration system. ${job.data.invitationUrl ?? "Sign in through the administration area."}`,
    },
    "account-disabled": {
      subject: "Your M&A Watch administration access changed",
      text: "Your M&A Watch administration access has been disabled. Contact a Super User if you believe this was unexpected.",
    },
  } as const;
  const template = templates[job.template];
  if (!template || !Array.isArray(job.to) || !job.to.length) {
    throw new PermanentJobError("The email job payload is invalid.");
  }
  return { ...template, to: job.to, template: job.template, data: job.data };
}

function titleCase(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}
