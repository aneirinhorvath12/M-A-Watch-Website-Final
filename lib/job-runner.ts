import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/bootstrap";
import { pruneExpiredAnalytics } from "@/lib/analytics";
import {
  MAX_ARTICLE_BODY_BYTES,
  validateArticleBlocks,
} from "@/lib/article-block-validation";
import type { EmailJob } from "@/lib/email-queue";
import {
  emailProviderRequestBody,
  resolveEmailProvider,
  type EmailProviderConfig,
  type EmailProviderSecrets,
} from "@/lib/email-provider";
import {
  interpretMalwareScanResult,
  resolveMalwareProvider,
  type MalwareProviderConfig,
  type MalwareProviderSecrets,
} from "@/lib/malware-provider";
import { validatedIntegrationUrl } from "@/lib/integration-security";
import {
  JOB_LEASE_MS,
  JOB_MAX_ATTEMPTS,
  JOB_REQUEST_TIMEOUT_MS,
  jobIdempotencyKey,
  jobRetryDelayMs,
} from "@/lib/job-policy";
import { createId, database, privateFiles, safeJson } from "@/lib/platform";
import { claimScopedImageId } from "@/lib/job-assets";
import { MAX_PARSE_WARNINGS_BYTES } from "@/lib/publication-revision-validation";
import { publicationSearchText } from "@/lib/publication-search-text";
import {
  AdobeParserAdapterError,
  AdobeStructuredDataError,
  adobeCompletionToParserResult,
  mapAdobeStructuredData,
  pollAdobeExtractJob,
  startAdobeExtractJob,
  type AdobeExtractJobState,
  type AdobeParserConfig,
  type AdobeParserEnv,
} from "@/lib/parser/adobe";
import { resolveParserProvider } from "@/lib/parser/provider";
import {
  applicantDeletionJobId,
  canonicalHttpsSiteUrl,
  isApplicantCvKey,
  isApplicantDeletionReason,
  secureAdminApplicationUrl,
  type ApplicantDeletionReason,
} from "@/lib/recruitment-policy";
import type { ArticleBlock } from "@/lib/publications/types";
import { utf8ByteLength } from "@/lib/text-limits";

const INTEGRATION_JOB_TYPES = [
  "email",
  "file_scan",
  "publication_parse",
] as const;
const INTEGRATION_JSON_RESPONSE_LIMIT = 2 * 1024 * 1024;
type IntegrationJobType = (typeof INTEGRATION_JOB_TYPES)[number];
type RuntimeSecrets = EmailProviderSecrets & MalwareProviderSecrets & AdobeParserEnv & {
  NEXT_PUBLIC_SITE_URL?: string;
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
  reason?: unknown;
  replacement?: unknown;
  expectedPublicationUpdatedAt?: unknown;
  adobeState?: unknown;
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
      kind: "publication_parse_pending";
      payload: StoredFilePayload;
      state: AdobeExtractJobState;
      retryAfterMs: number;
    }
  | {
      kind: "publication_parse";
      payload: StoredFilePayload;
      result: ParserWebhookResult;
      managedAssetKeys?: string[];
    };
type CompletedInvocationResult = Exclude<
  InvocationResult,
  { kind: "publication_parse_pending" }
>;

type IntegrationConfig = {
  endpoint: string;
  token?: string;
  emailProvider?: EmailProviderConfig;
  malwareProvider?: MalwareProviderConfig;
  adobeParser?: AdobeParserConfig;
  canonicalSiteUrl?: string;
};

export type JobRunSummary = {
  scheduledPublished: number;
  staleRecovered: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  awaitingConfiguration: number;
  retentionQueued: number;
  rateLimitsPruned: number;
  analyticsRowsPruned: number;
};

class PermanentJobError extends Error {}
class JobClaimLostError extends Error {}

const MAX_PARSE_METADATA_BYTES = 64_000;

export async function runMaintenance(limit = 5): Promise<JobRunSummary> {
  await ensureDatabase();
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 10));
  const now = Date.now();
  const secrets = env as unknown as RuntimeSecrets;
  const staleRecovered = await recoverStaleJobs(now);
  const scheduledPublished = await publishDueItems(now, boundedLimit);
  const retentionQueued = await queueExpiredApplicantDeletions(
    now,
    boundedLimit,
  );
  const rateLimitsPruned = await pruneExpiredRateLimits(now);
  const analyticsRowsPruned = await pruneExpiredAnalytics(now);
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
    retentionQueued,
    rateLimitsPruned,
    analyticsRowsPruned,
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

async function queueExpiredApplicantDeletions(
  now: number,
  limit: number,
): Promise<number> {
  const due = await database()
    .prepare(
      `SELECT id, cv_key, retention_expires_at
       FROM applicants
       WHERE retention_expires_at IS NOT NULL
         AND retention_expires_at <= ?
         AND deletion_requested_at IS NULL
       ORDER BY retention_expires_at ASC
       LIMIT ?`,
    )
    .bind(now, limit)
    .all<{ id: string; cv_key: string; retention_expires_at: number }>();

  let queued = 0;
  for (const applicant of due.results) {
    if (!isApplicantCvKey(applicant.id, applicant.cv_key)) {
      console.error(
        "Applicant retention could not queue because the private object reference is invalid",
      );
      continue;
    }
    const jobId = applicantDeletionJobId(applicant.id);
    const payload = JSON.stringify({
      applicationId: applicant.id,
      key: applicant.cv_key,
      reason: "retention_expired" satisfies ApplicantDeletionReason,
    });
    const db = database();
    const results = await db.batch([
      db
        .prepare(
          `UPDATE applicants
           SET deletion_requested_at = ?, deletion_requested_by = NULL,
               updated_at = ?
           WHERE id = ? AND retention_expires_at <= ?
             AND deletion_requested_at IS NULL`,
        )
        .bind(now, now, applicant.id, now),
      db
        .prepare(
          `INSERT OR IGNORE INTO background_jobs
           (id, type, status, payload, attempts, run_after, created_at, updated_at)
           SELECT ?, 'applicant_delete', 'queued', ?, 0, ?, ?, ?
           FROM applicants
           WHERE id = ? AND deletion_requested_at = ?`,
        )
        .bind(jobId, payload, now, now, now, applicant.id, now),
      db
        .prepare(
          `INSERT INTO audit_log
           (id, actor_id, action, entity_type, entity_id, metadata, created_at)
           SELECT ?, NULL, 'applicant.retention_deletion_queued',
                  'applicant', id, ?, ?
           FROM applicants
           WHERE id = ? AND deletion_requested_at = ?`,
        )
        .bind(
          createId("audit"),
          JSON.stringify({
            retentionExpiresAt: applicant.retention_expires_at,
          }),
          now,
          applicant.id,
          now,
        ),
    ]);
    if ((results[0].meta.changes ?? 0) === 1) queued += 1;
  }
  return queued;
}

async function pruneExpiredRateLimits(now: number): Promise<number> {
  const result = await database()
    .prepare("DELETE FROM rate_limits WHERE expires_at <= ?")
    .bind(now)
    .run();
  return result.meta.changes ?? 0;
}

async function recoverStaleJobs(now: number): Promise<number> {
  const result = await database()
    .prepare(
      `UPDATE background_jobs
       SET status = 'queued', error = 'The previous worker lease expired; retrying.',
           claim_token = NULL, run_after = ?, updated_at = ?
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
       ORDER BY CASE WHEN type = 'applicant_delete' THEN 0 ELSE 1 END,
                created_at ASC LIMIT ?`,
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
  const claimToken = crypto.randomUUID();
  const claim = await database()
    .prepare(
      `UPDATE background_jobs
       SET status = 'running', attempts = attempts + 1, error = NULL,
           claim_token = ?, updated_at = ?
       WHERE id = ? AND status = 'queued' AND run_after <= ?`,
    )
    .bind(claimToken, claimedAt, job.id, claimedAt)
    .run();
  if ((claim.meta.changes ?? 0) !== 1) return "skipped";

  const attempt = job.attempts + 1;
  let managedAssetKeys: string[] = [];
  try {
    if (job.type === "applicant_delete") {
      await deleteApplicantData(job, claimToken);
      return "succeeded";
    }
    if (!isIntegrationJobType(job.type)) {
      throw new PermanentJobError("Unsupported background job type.");
    }
    const integration = integrationFor(job.type, secrets);
    if (!integration?.endpoint) {
      throw new Error("The integration is not configured.");
    }
    const result = await invokeIntegration(job, integration, claimToken);
    if (result.kind === "publication_parse_pending") {
      await deferPublicationParse(job, result, claimToken);
      return "skipped";
    }
    if (result.kind === "publication_parse") {
      managedAssetKeys = result.managedAssetKeys ?? [];
    }
    await finishSuccessfulJob(job, result, claimToken);
    return "succeeded";
  } catch (error) {
    if (managedAssetKeys.length) {
      await deleteUnreferencedPublicationAssets(managedAssetKeys);
    }
    if (error instanceof JobClaimLostError) return "skipped";
    const recorded = await finishFailedJob(job, attempt, error, claimToken);
    return recorded ? "failed" : "skipped";
  }
}

async function deferPublicationParse(
  job: JobRow,
  result: Extract<InvocationResult, { kind: "publication_parse_pending" }>,
  claimToken: string,
): Promise<void> {
  const now = Date.now();
  const retryAfterMs = Math.max(
    2_000,
    Math.min(60_000, Math.floor(result.retryAfterMs)),
  );
  const payload = JSON.stringify({
    ...result.payload,
    adobeState: result.state,
  });
  const deferred = await database()
    .prepare(
      `UPDATE background_jobs
       SET status = 'queued', payload = ?,
           attempts = CASE WHEN attempts > 0 THEN attempts - 1 ELSE 0 END,
           error = NULL, claim_token = NULL, run_after = ?, updated_at = ?
       WHERE id = ? AND status = 'running' AND claim_token = ?`,
    )
    .bind(payload, now + retryAfterMs, now, job.id, claimToken)
    .run();
  if ((deferred.meta.changes ?? 0) !== 1) {
    throw new JobClaimLostError(
      "The pending Adobe extraction lease was replaced before it could be deferred.",
    );
  }
}

async function deleteApplicantData(job: JobRow, claimToken: string): Promise<void> {
  const payload = safeJson<StoredFilePayload | null>(job.payload, null);
  const applicantId = stringField(payload?.applicationId);
  const key = stringField(payload?.key);
  const rawReason = payload?.reason;
  if (
    !applicantId ||
    !key ||
    !isApplicantDeletionReason(rawReason) ||
    !isApplicantCvKey(applicantId, key)
  ) {
    throw new PermanentJobError("The applicant deletion job payload is invalid.");
  }

  const applicant = await database()
    .prepare(
      `SELECT cv_key, submitted_at, privacy_policy_version,
              retention_expires_at, deletion_requested_at,
              deletion_requested_by
       FROM applicants WHERE id = ? LIMIT 1`,
    )
    .bind(applicantId)
    .first<{
      cv_key: string;
      submitted_at: number;
      privacy_policy_version: string;
      retention_expires_at: number | null;
      deletion_requested_at: number | null;
      deletion_requested_by: string | null;
    }>();
  if (!applicant) {
    await privateFiles().delete(key);
    const completed = await database()
      .prepare(
        `UPDATE background_jobs
         SET status = 'succeeded', payload = ?, error = NULL,
             claim_token = NULL, updated_at = ?
         WHERE id = ? AND status = 'running' AND claim_token = ?`,
      )
      .bind(
        JSON.stringify({ applicantDeleted: true, reason: rawReason }),
        Date.now(),
        job.id,
        claimToken,
      )
      .run();
    if ((completed.meta.changes ?? 0) !== 1) {
      throw new JobClaimLostError("The applicant deletion lease was replaced.");
    }
    return;
  }
  if (applicant.cv_key !== key || !applicant.deletion_requested_at) {
    throw new PermanentJobError(
      "The applicant deletion request no longer matches the stored record.",
    );
  }
  if (
    rawReason === "retention_expired" &&
    (!applicant.retention_expires_at || applicant.retention_expires_at > Date.now())
  ) {
    throw new PermanentJobError(
      "The applicant has not reached the recorded retention date.",
    );
  }
  if (
    rawReason !== "retention_expired" &&
    !applicant.deletion_requested_by
  ) {
    throw new PermanentJobError(
      "The applicant deletion does not have an authorised requester.",
    );
  }

  // R2 and D1 cannot share a transaction. Removing the private object first is
  // intentionally idempotent: if the following D1 batch fails, the job retries
  // and no CV becomes reachable while a deletion is pending.
  await assertActiveJobClaim(job.id, claimToken);
  await privateFiles().delete(key);
  const now = Date.now();
  const redactedPayload = JSON.stringify({
    applicantDeleted: true,
    reason: rawReason,
  });
  const db = database();
  const results = await db.batch([
    db
      .prepare(
        `DELETE FROM background_jobs
         WHERE id <> ?
           AND EXISTS (
             SELECT 1 FROM background_jobs AS claimed_job
             WHERE claimed_job.id = ? AND claimed_job.status = 'running'
               AND claimed_job.claim_token = ?
           )
           AND
           CASE WHEN json_valid(payload) THEN
             json_extract(payload, '$.applicationId') = ? OR
             json_extract(payload, '$.data.applicationId') = ?
           ELSE 0 END`,
      )
      .bind(job.id, job.id, claimToken, applicantId, applicantId),
    db
      .prepare(
        `DELETE FROM applicant_notes
         WHERE applicant_id = ? AND EXISTS (
           SELECT 1 FROM background_jobs
           WHERE id = ? AND status = 'running' AND claim_token = ?
         )`,
      )
      .bind(applicantId, job.id, claimToken),
    db
      .prepare(
        `DELETE FROM applicant_status_history
         WHERE applicant_id = ? AND EXISTS (
           SELECT 1 FROM background_jobs
           WHERE id = ? AND status = 'running' AND claim_token = ?
         )`,
      )
      .bind(applicantId, job.id, claimToken),
    db
      .prepare(
        `INSERT INTO audit_log
         (id, actor_id, action, entity_type, entity_id, metadata, created_at)
         SELECT ?, NULL, 'applicant.deleted', 'applicant', id, ?, ?
         FROM applicants WHERE id = ? AND cv_key = ?
           AND EXISTS (
             SELECT 1 FROM background_jobs
             WHERE id = ? AND status = 'running' AND claim_token = ?
           )`,
      )
      .bind(
        createId("audit"),
        JSON.stringify({
          reason: rawReason,
          submittedAt: applicant.submitted_at,
          privacyPolicyVersion: applicant.privacy_policy_version,
          retentionExpiresAt: applicant.retention_expires_at,
        }),
        now,
        applicantId,
        key,
        job.id,
        claimToken,
      ),
    db
      .prepare(
        `DELETE FROM applicants
         WHERE id = ? AND cv_key = ? AND deletion_requested_at IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM background_jobs
             WHERE id = ? AND status = 'running' AND claim_token = ?
           )`,
      )
      .bind(applicantId, key, job.id, claimToken),
    db
      .prepare(
        `UPDATE background_jobs
         SET status = 'succeeded', payload = ?, error = NULL,
             claim_token = NULL, updated_at = ?
         WHERE id = ? AND status = 'running' AND claim_token = ?`,
      )
      .bind(redactedPayload, now, job.id, claimToken),
  ]);
  if ((results.at(-1)?.meta.changes ?? 0) !== 1) {
    throw new JobClaimLostError("The applicant deletion lease was replaced.");
  }
}

async function assertActiveJobClaim(id: string, claimToken: string): Promise<void> {
  const claimed = await database()
    .prepare(
      `SELECT 1 AS present FROM background_jobs
       WHERE id = ? AND status = 'running' AND claim_token = ? LIMIT 1`,
    )
    .bind(id, claimToken)
    .first<{ present: number }>();
  if (!claimed) throw new JobClaimLostError("The background job lease was replaced.");
}

function isIntegrationJobType(value: string): value is IntegrationJobType {
  return (INTEGRATION_JOB_TYPES as readonly string[]).includes(value);
}

function integrationFor(
  type: IntegrationJobType,
  secrets: RuntimeSecrets,
): IntegrationConfig | null {
  if (type === "email") {
    const emailProvider = resolveEmailProvider(secrets, {
      allowLoopbackHttp: process.env.NODE_ENV === "development",
    });
    return emailProvider
      ? {
          endpoint: emailProvider.endpoint,
          token: emailProvider.token,
          emailProvider,
          canonicalSiteUrl:
            canonicalHttpsSiteUrl(secrets.NEXT_PUBLIC_SITE_URL) ?? undefined,
        }
      : null;
  }
  if (type === "file_scan") {
    const malwareProvider = resolveMalwareProvider(secrets, {
      allowLoopbackHttp: process.env.NODE_ENV === "development",
    });
    return malwareProvider
      ? {
          endpoint: malwareProvider.endpoint,
          token:
            malwareProvider.kind === "webhook"
              ? malwareProvider.bearerToken
              : undefined,
          malwareProvider,
        }
      : null;
  }
  const parserProvider = resolveParserProvider(secrets, {
    allowLoopbackHttp: process.env.NODE_ENV === "development",
  });
  if (parserProvider?.kind === "webhook") {
    return {
      endpoint: parserProvider.endpoint,
      token: parserProvider.token,
    };
  }
  return parserProvider?.kind === "adobe"
    ? { endpoint: parserProvider.config.baseUrl, adobeParser: parserProvider.config }
    : null;
}

async function invokeIntegration(
  job: JobRow,
  integration: IntegrationConfig,
  claimToken: string,
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
    const body = buildEmailPayload(emailJob, integration.canonicalSiteUrl);
    if (!integration.emailProvider) {
      throw new PermanentJobError("The email integration is invalid.");
    }
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { ...baseHeaders, "content-type": "application/json" },
      body: JSON.stringify(
        emailProviderRequestBody(integration.emailProvider, body),
      ),
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
  if (job.type === "publication_parse" && integration.adobeParser) {
    return invokeAdobeParser(
      job,
      payload,
      key,
      integration.adobeParser,
      claimToken,
    );
  }
  const object = await privateFiles().get(key);
  if (!object) throw new PermanentJobError("The stored PDF is unavailable.");
  if (
    job.type === "publication_parse" &&
    object.customMetadata?.scanStatus !== "clean"
  ) {
    throw new PermanentJobError(
      "The stored PDF has not passed the required malware scan.",
    );
  }
  const bytes = await object.arrayBuffer();
  const resourceId =
    stringField(payload.publicationId) ?? stringField(payload.applicationId);
  const request =
    job.type === "file_scan" && integration.malwareProvider?.kind === "cloudmersive"
      ? cloudmersiveScanRequest(
          integration.malwareProvider,
          bytes,
          object.httpMetadata?.contentType ?? "application/pdf",
        )
      : {
          headers: {
            "content-type": object.httpMetadata?.contentType ?? "application/pdf",
          },
          body: bytes,
        };
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      ...baseHeaders,
      ...request.headers,
      ...(resourceId ? { "x-ma-watch-resource-id": resourceId } : {}),
    },
    body: request.body,
  });
  assertSuccessfulResponse(response);

  if (job.type === "file_scan") {
    if (!integration.malwareProvider) {
      throw new PermanentJobError("The malware integration is invalid.");
    }
    const result = await readJsonObject(response);
    const decision = interpretMalwareScanResult(
      integration.malwareProvider,
      result,
    );
    if (decision === "rejected") {
      throw new PermanentJobError("The malware scanner rejected the PDF.");
    }
    if (decision !== "clean") {
      throw new Error("The malware scanner did not return an explicit clean result.");
    }
    return { kind: "file_scan", payload };
  }

  const result = normaliseParserResult(await readJsonObject(response), payload);
  return { kind: "publication_parse", payload, result };
}

async function invokeAdobeParser(
  job: JobRow,
  payload: StoredFilePayload,
  key: string,
  config: AdobeParserConfig,
  claimToken: string,
): Promise<InvocationResult> {
  const publicationId = stringField(payload.publicationId);
  if (!publicationId) {
    throw new PermanentJobError("The Adobe parser job is not linked to a publication.");
  }
  const publication = await database()
    .prepare(
      `SELECT type FROM publications
       WHERE id = ? AND source_pdf_key = ? AND type IN ('strategic', 'legal')
       LIMIT 1`,
    )
    .bind(publicationId, key)
    .first<{ type: "strategic" | "legal" }>();

  // A source replacement can make a queued parser job stale. Do not spend a
  // provider transaction in that case; finishPublicationParse will mark this
  // obsolete job succeeded without attaching output to the new source.
  if (!publication) {
    return {
      kind: "publication_parse",
      payload,
      result: {
        status: "parse-failed",
        publicationId,
        parserVersion: "adobe-pdf-extract-stale-source",
        blocks: [],
        warnings: [],
        metadata: {},
        error: "The parser job was superseded by a newer source PDF.",
      },
    };
  }

  let managedAssetKeys: string[] = [];
  try {
    const state = adobeStateFromPayload(payload.adobeState);
    const outcome = state
      ? await pollAdobeExtractJob(config, state)
      : await startAdobeParserForStoredFile(config, key);

    if (outcome.kind === "pending") {
      return {
        kind: "publication_parse_pending",
        payload,
        state: outcome.state,
        retryAfterMs: outcome.retryAfterMs,
      };
    }
    if (outcome.kind === "failed") {
      return {
        kind: "publication_parse",
        payload,
        result: {
          status: "parse-failed",
          publicationId,
          parserVersion: "adobe-pdf-extract",
          blocks: [],
          warnings: [
            {
              code: outcome.code,
              severity: "error",
              message: outcome.message,
              requiresEditorialReview: true,
            },
          ],
          metadata: { provider: "adobe-pdf-services" },
          error: outcome.message,
        },
      };
    }

    // Completion only needs immutable object metadata plus the PDF signature.
    // A bounded range avoids re-buffering a source that may be up to 50 MB
    // while the Adobe JSON and figure archive are already resident.
    const object = await privateFiles().get(key, {
      range: { offset: 0, length: 8 },
    });
    if (!object) throw new PermanentJobError("The stored PDF is unavailable.");
    if (object.customMetadata?.scanStatus !== "clean") {
      throw new PermanentJobError(
        "The stored PDF has not passed the required malware scan.",
      );
    }
    const signatureBytes = new Uint8Array(await object.arrayBuffer());
    const storedFigures = await storeAdobeFigureRenditions(
      publicationId,
      job.id,
      claimToken,
      outcome.figureRenditions,
    );
    managedAssetKeys = storedFigures.keys;
    const extraction = mapAdobeStructuredData(outcome.structuredData, {
      figureAssets: storedFigures.assets,
    });
    const parserResult = adobeCompletionToParserResult(
      {
        jobId: job.id,
        publicationId,
        publicationType: publication.type,
        filename:
          object.customMetadata?.originalFilename ??
          key.split("/").at(-1) ??
          "source.pdf",
        mimeType: object.httpMetadata?.contentType ?? "application/pdf",
        size: object.size,
        bytes: signatureBytes,
        requestedAt: new Date().toISOString(),
      },
      { ...outcome, extraction },
    );
    // Retain only images that survive final parser validation. Mapping can
    // produce image candidates which are intentionally removed when the
    // completed parser result fails its safety checks.
    const referencedFigureSources = new Set(
      parserResult.blocks.flatMap(({ block }) =>
        block.type === "image" ? [block.src] : [],
      ),
    );
    const unusedKeys: string[] = [];
    const retainedKeys: string[] = [];
    for (const [path, key] of storedFigures.keysByPath) {
      const source = storedFigures.assets.get(path)?.src;
      (
        parserResult.status === "draft" &&
        source &&
        referencedFigureSources.has(source)
          ? retainedKeys
          : unusedKeys
      ).push(key);
    }
    if (unusedKeys.length) {
      await deleteUnreferencedPublicationAssets(unusedKeys);
    }
    managedAssetKeys = retainedKeys;
    return {
      kind: "publication_parse",
      payload,
      managedAssetKeys,
      result: {
        status: parserResult.status,
        publicationId,
        parserVersion: parserResult.parserVersion,
        blocks: parserResult.blocks.map((item) => item.block),
        warnings: parserResult.warnings,
        metadata: {
          ...parserResult.metadata,
          managedFigureCount: retainedKeys.length,
        },
        error:
          parserResult.status === "parse-failed"
            ? "Adobe extraction output did not pass the parser safety checks."
            : undefined,
      },
    };
  } catch (error) {
    if (managedAssetKeys.length) {
      await deleteUnreferencedPublicationAssets(managedAssetKeys);
    }
    if (
      error instanceof AdobeStructuredDataError ||
      (error instanceof AdobeParserAdapterError && !error.retryable)
    ) {
      throw new PermanentJobError(error.message);
    }
    throw error;
  }
}

async function storeAdobeFigureRenditions(
  publicationId: string,
  jobId: string,
  claimToken: string,
  renditions: readonly {
    path: string;
    bytes: Uint8Array;
    width: number;
    height: number;
  }[],
): Promise<{
  assets: Map<string, { src: string; width: number; height: number }>;
  keys: string[];
  keysByPath: Map<string, string>;
}> {
  const assets = new Map<
    string,
    { src: string; width: number; height: number }
  >();
  const keys: string[] = [];
  const keysByPath = new Map<string, string>();
  try {
    for (const rendition of renditions) {
      const assetId = `${await claimScopedImageId(jobId, claimToken, rendition.bytes)}.png`;
      const key = `private/publication-assets/${publicationId}/${assetId}`;
      await privateFiles().put(key, rendition.bytes, {
        httpMetadata: { contentType: "image/png" },
        customMetadata: {
          publicationId,
          originalFilename: rendition.path.split("/").at(-1) ?? "figure.png",
          width: String(rendition.width),
          height: String(rendition.height),
          source: "adobe-pdf-extract",
        },
      });
      assets.set(rendition.path, {
        src: `/api/publications/${encodeURIComponent(publicationId)}/images/${assetId}`,
        width: rendition.width,
        height: rendition.height,
      });
      keys.push(key);
      keysByPath.set(rendition.path, key);
    }
  } catch (error) {
    await deleteUnreferencedPublicationAssets(keys);
    throw error;
  }
  return { assets, keys, keysByPath };
}

async function deleteUnreferencedPublicationAssets(
  keys: readonly string[],
): Promise<void> {
  for (const key of new Set(keys)) {
    try {
      const match = key.match(
        /^private\/publication-assets\/publication_[0-9a-f-]{36}\/([0-9a-f-]{36}\.png)$/i,
      );
      if (!match) continue;
      const assetId = match[1];
      const referenced = await database()
        .prepare(
          `SELECT 1 AS present FROM publications WHERE instr(web_body, ?) > 0
           UNION ALL
           SELECT 1 AS present FROM publication_revisions WHERE instr(web_body, ?) > 0
           LIMIT 1`,
        )
        .bind(assetId, assetId)
        .first<{ present: number }>();
      if (!referenced) await privateFiles().delete(key);
    } catch {
      // Cleanup must never replace the parser result or retry decision. The
      // orphan is safe and private; monitoring can surface repeated failures.
      console.error("Unable to clean up an unreferenced parser image.");
    }
  }
}

async function startAdobeParserForStoredFile(
  config: AdobeParserConfig,
  key: string,
) {
  const object = await privateFiles().get(key);
  if (!object) throw new PermanentJobError("The stored PDF is unavailable.");
  if (object.customMetadata?.scanStatus !== "clean") {
    throw new PermanentJobError(
      "The stored PDF has not passed the required malware scan.",
    );
  }
  return startAdobeExtractJob(config, await object.arrayBuffer());
}

function adobeStateFromPayload(value: unknown): AdobeExtractJobState | null {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PermanentJobError("The persisted Adobe parser state is invalid.");
  }
  return value as AdobeExtractJobState;
}

function cloudmersiveScanRequest(
  provider: Extract<MalwareProviderConfig, { kind: "cloudmersive" }>,
  bytes: ArrayBuffer,
  contentType: string,
): { headers: Record<string, string>; body: FormData } {
  const form = new FormData();
  form.append(
    "inputFile",
    new Blob([bytes], { type: contentType }),
    "upload.pdf",
  );
  return {
    headers: {
      apikey: provider.apiKey,
      restrictfiletypes: ".pdf",
    },
    body: form,
  };
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
    const bytes = await readBoundedIntegrationResponse(response);
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new Error("The integration returned an invalid JSON response.");
  }
}

async function readBoundedIntegrationResponse(
  response: Response,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > INTEGRATION_JSON_RESPONSE_LIMIT
  ) {
    throw new Error("Integration response too large");
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      void reader.cancel().catch(() => undefined);
      reject(new Error("Integration response timed out"));
    }, JOB_REQUEST_TIMEOUT_MS);
  });
  const read = async () => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > INTEGRATION_JSON_RESPONSE_LIMIT) {
          void reader.cancel().catch(() => undefined);
          throw new Error("Integration response too large");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  };
  try {
    return await Promise.race([read(), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
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
  result: CompletedInvocationResult,
  claimToken: string,
): Promise<void> {
  if (result.kind === "email") {
    await markJobSucceeded(job.id, claimToken);
    return;
  }
  if (result.kind === "file_scan") {
    await finishFileScan(job, result.payload, claimToken);
    return;
  }
  const retained = await finishPublicationParse(
    job,
    result.payload,
    result.result,
    claimToken,
  );
  if (!retained && result.managedAssetKeys?.length) {
    await deleteUnreferencedPublicationAssets(result.managedAssetKeys);
  }
}

async function markJobSucceeded(id: string, claimToken: string): Promise<void> {
  const completed = await database()
    .prepare(
      `UPDATE background_jobs
       SET status = 'succeeded', error = NULL, claim_token = NULL, updated_at = ?
       WHERE id = ? AND status = 'running' AND claim_token = ?`,
    )
    .bind(Date.now(), id, claimToken)
    .run();
  if ((completed.meta.changes ?? 0) !== 1) {
    throw new JobClaimLostError("The background job lease was replaced.");
  }
}

async function finishFileScan(
  job: JobRow,
  payload: StoredFilePayload,
  claimToken: string,
): Promise<void> {
  const key = storedFileKey(payload, "file_scan");
  await assertActiveJobClaim(job.id, claimToken);
  await setStoredFileScanStatus(key, "clean");
  const now = Date.now();
  const publicationId = stringField(payload.publicationId);
  const applicationId = stringField(payload.applicationId);
  const db = database();
  const statements: D1PreparedStatement[] = [];

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
           WHERE id = ? AND source_pdf_key = ? AND status = 'uploaded'
             AND EXISTS (
               SELECT 1 FROM background_jobs
               WHERE id = ? AND status = 'running' AND claim_token = ?
             )`,
        )
        .bind(now, publicationId, key, job.id, claimToken),
      database()
        .prepare(
          `INSERT OR IGNORE INTO background_jobs
           (id, type, status, payload, attempts, run_after, created_at, updated_at)
           SELECT ?, 'publication_parse', 'queued', ?, 0, ?, ?, ?
           FROM publications
           WHERE id = ? AND source_pdf_key = ? AND type IN ('strategic', 'legal')
             AND EXISTS (
               SELECT 1 FROM background_jobs
               WHERE id = ? AND status = 'running' AND claim_token = ?
             )`,
        )
        .bind(
          parseJobId,
          parsePayload,
          now,
          now,
          now,
          publicationId,
          key,
          job.id,
          claimToken,
        ),
      database()
        .prepare(
          `INSERT INTO audit_log
           (id, actor_id, action, entity_type, entity_id, metadata, created_at)
           SELECT ?, NULL, 'publication.file_scan_succeeded', 'publication', id, ?, ?
           FROM publications WHERE id = ? AND source_pdf_key = ?
             AND EXISTS (
               SELECT 1 FROM background_jobs
               WHERE id = ? AND status = 'running' AND claim_token = ?
             )`,
        )
        .bind(
          createId("audit"),
          JSON.stringify({ jobId: job.id }),
          now,
          publicationId,
          key,
          job.id,
          claimToken,
        ),
    );
  } else if (applicationId) {
    statements.push(
      database()
        .prepare(
          `UPDATE applicants SET updated_at = ? WHERE id = ? AND cv_key = ?
           AND EXISTS (
             SELECT 1 FROM background_jobs
             WHERE id = ? AND status = 'running' AND claim_token = ?
           )`,
        )
        .bind(now, applicationId, key, job.id, claimToken),
      database()
        .prepare(
          `INSERT INTO audit_log
           (id, actor_id, action, entity_type, entity_id, metadata, created_at)
           SELECT ?, NULL, 'application.file_scan_succeeded', 'applicant', id, ?, ?
           FROM applicants WHERE id = ? AND cv_key = ?
             AND EXISTS (
               SELECT 1 FROM background_jobs
               WHERE id = ? AND status = 'running' AND claim_token = ?
             )`,
        )
        .bind(
          createId("audit"),
          JSON.stringify({ jobId: job.id }),
          now,
          applicationId,
          key,
          job.id,
          claimToken,
        ),
    );
  } else {
    throw new PermanentJobError("The file scan is not linked to a record.");
  }
  statements.push(
    db
      .prepare(
        `UPDATE background_jobs
         SET status = 'succeeded', error = NULL, claim_token = NULL, updated_at = ?
         WHERE id = ? AND status = 'running' AND claim_token = ?`,
      )
      .bind(now, job.id, claimToken),
  );
  const results = await db.batch(statements);
  if ((results.at(-1)?.meta.changes ?? 0) !== 1) {
    throw new JobClaimLostError("The file-scan lease was replaced.");
  }
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
  claimToken: string,
): Promise<boolean> {
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
       WHERE id = ? AND source_pdf_key = ? AND type IN ('strategic', 'legal')
         AND EXISTS (
           SELECT 1 FROM background_jobs
           WHERE id = ? AND status = 'running' AND claim_token = ?
         )`,
    )
    .bind(result.publicationId, key, job.id, claimToken)
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
    await markJobSucceeded(job.id, claimToken);
    return false;
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
                 AND status = 'parsing' AND updated_at = ? AND web_body = '[]'
                 AND EXISTS (
                   SELECT 1 FROM background_jobs
                   WHERE id = ? AND status = 'running' AND claim_token = ?
                 )`,
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
              job.id,
              claimToken,
            )
            .run()
        : await database()
            .prepare(
              `UPDATE publications
               SET status = 'parse_failed', parser_version = ?, parse_warnings = ?,
                   parse_error = ?, structured_metadata = ?, updated_at = ?
               WHERE id = ? AND source_pdf_key = ? AND type IN ('strategic', 'legal')
                 AND status = 'parsing' AND updated_at = ?
                 AND EXISTS (
                   SELECT 1 FROM background_jobs
                   WHERE id = ? AND status = 'running' AND claim_token = ?
                 )`,
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
              job.id,
              claimToken,
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
           AND status = 'parsing'
           AND EXISTS (
             SELECT 1 FROM background_jobs
             WHERE id = ? AND status = 'running' AND claim_token = ?
           )`,
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
        job.id,
        claimToken,
      )
      .run();
    workflowStateUpdated = (workflowUpdate.meta.changes ?? 0) === 1;
  }

  const revisionId = `revision_parse_${job.id}`;
  const db = database();
  const statements: D1PreparedStatement[] = [];

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
           FROM publications WHERE id = ? AND source_pdf_key = ?
             AND EXISTS (
               SELECT 1 FROM background_jobs
               WHERE id = ? AND status = 'running' AND claim_token = ?
             )`,
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
          job.id,
          claimToken,
        ),
    );
  }

  statements.push(
    database()
      .prepare(
        `INSERT INTO audit_log
         (id, actor_id, action, entity_type, entity_id, metadata, created_at)
         SELECT ?, NULL, ?, 'publication', id, ?, ?
         FROM publications WHERE id = ? AND source_pdf_key = ?
           AND EXISTS (
             SELECT 1 FROM background_jobs
             WHERE id = ? AND status = 'running' AND claim_token = ?
           )`,
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
        job.id,
        claimToken,
      ),
  );
  statements.push(
    db
      .prepare(
        `UPDATE background_jobs
         SET status = 'succeeded', error = NULL, claim_token = NULL, updated_at = ?
         WHERE id = ? AND status = 'running' AND claim_token = ?`,
      )
      .bind(now, job.id, claimToken),
  );
  const completed = await db.batch(statements);
  if ((completed.at(-1)?.meta.changes ?? 0) !== 1) {
    throw new JobClaimLostError("The publication-parser lease was replaced.");
  }
  return true;
}

async function finishFailedJob(
  job: JobRow,
  attempts: number,
  error: unknown,
  claimToken: string,
): Promise<boolean> {
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
      await assertActiveJobClaim(job.id, claimToken);
      await setStoredFileScanStatus(key, "rejected");
    } catch (metadataError) {
      if (metadataError instanceof JobClaimLostError) return false;
      console.error("Unable to record the rejected file scan metadata", metadataError);
    }
  }

  const db = database();
  const statements: D1PreparedStatement[] = [];

  const publicationId = stringField(payload?.publicationId);
  if (terminal && publicationId && key) {
    const publicationTypePredicate =
      job.type === "file_scan" ? "" : "AND type IN ('strategic', 'legal')";
    // An editor may take over a parser job while its worker still owns a
    // lease. Keep this guard in the mutation itself so a late terminal result
    // cannot move that recovered Draft back to parse_failed.
    const publicationStatusPredicate =
      job.type === "publication_parse" ? "AND status = 'parsing'" : "";
    statements.push(
      // Insert the audit row before the guarded state transition. D1 batches
      // execute in order, so the pre-transition `status = 'parsing'` predicate
      // still distinguishes a genuine parser failure from a recovered Draft.
      database()
        .prepare(
          `INSERT INTO audit_log
           (id, actor_id, action, entity_type, entity_id, metadata, created_at)
           SELECT ?, NULL, ?, 'publication', id, ?, ?
           FROM publications WHERE id = ? AND source_pdf_key = ?
             ${publicationStatusPredicate}
             AND EXISTS (
               SELECT 1 FROM background_jobs
               WHERE id = ? AND status = 'running' AND claim_token = ?
             )`,
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
          job.id,
          claimToken,
        ),
      database()
        .prepare(
          `UPDATE publications
           SET status = 'parse_failed', parse_error = ?, updated_at = ?
           WHERE id = ? AND source_pdf_key = ? ${publicationTypePredicate}
             ${publicationStatusPredicate}
             AND EXISTS (
               SELECT 1 FROM background_jobs
               WHERE id = ? AND status = 'running' AND claim_token = ?
             )`,
        )
        .bind(
          job.type === "file_scan"
            ? "The source PDF did not pass the required security scan."
            : "The parser could not produce a draft after repeated attempts.",
          now,
          publicationId,
          key,
          job.id,
          claimToken,
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
           FROM applicants WHERE id = ? AND cv_key = ?
             AND EXISTS (
               SELECT 1 FROM background_jobs
               WHERE id = ? AND status = 'running' AND claim_token = ?
             )`,
        )
        .bind(
          createId("audit"),
          JSON.stringify({ jobId: job.id, attempts }),
          now,
          applicationId,
          key,
          job.id,
          claimToken,
        ),
    );
  }
  statements.push(
    db
      .prepare(
        `UPDATE background_jobs
         SET status = ?, error = ?, claim_token = NULL, run_after = ?, updated_at = ?
         WHERE id = ? AND status = 'running' AND claim_token = ?`,
      )
      .bind(
        terminal ? "failed" : "queued",
        message,
        now + jobRetryDelayMs(attempts),
        now,
        job.id,
        claimToken,
      ),
  );
  const results = await db.batch(statements);
  return (results.at(-1)?.meta.changes ?? 0) === 1;
}

function safeJobError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "The integration request timed out.";
  }
  const message = error instanceof Error ? error.message : "The background job failed.";
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

function buildEmailPayload(job: EmailJob, canonicalSiteUrl?: string) {
  const division = titleCase(job.data.division ?? "");
  const adminApplicationUrl =
    job.template === "new-application-admin"
      ? secureAdminApplicationUrl(
          canonicalSiteUrl,
          job.data.applicationPath,
        )
      : null;
  if (job.template === "new-application-admin" && !adminApplicationUrl) {
    throw new PermanentJobError(
      "The administrator application link is not securely configured.",
    );
  }
  const templates = {
    "applicant-confirmation": {
      subject: "We received your M&A Watch application",
      text: `Hello ${job.data.name},\n\nThank you for applying to M&A Watch's ${division} division. We have received your application. This confirmation does not imply acceptance.\n\nQuestions? Contact ${job.data.contactEmail ?? "hello@mawatch.org"}.`,
    },
    "new-application-admin": {
      subject: `New ${division} application — ${job.data.name}`,
      text: `${job.data.name} from ${job.data.university} submitted an application to ${division} at ${job.data.submittedAt ?? "the recorded submission time"}. Open the secure applicant record: ${adminApplicationUrl}`,
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
