import { ensureDatabase } from "@/db/bootstrap";
import {
  apiError,
  authorizeAdminRequest,
  normaliseSlug,
  readJsonObject,
  splitList,
  stringValue,
} from "@/lib/admin-api";
import {
  MAX_ARTICLE_BODY_BYTES,
  validateArticleBlocks,
} from "@/lib/article-block-validation";
import { getPublicationAdmin } from "@/lib/admin-data";
import { writeAudit } from "@/lib/audit";
import { createId, database, privateFiles, safeJson } from "@/lib/platform";
import { publicationSearchText } from "@/lib/publication-search-text";
import type { ArticleBlock } from "@/lib/publications/types";
import { inspectPdf, MAX_PUBLICATION_BYTES } from "@/lib/security";
import { boundedSearchText, utf8ByteLength } from "@/lib/text-limits";

export const dynamic = "force-dynamic";

function parseBody(value: unknown): { value?: string; blocks?: ArticleBlock[]; error?: string; missingAlt?: boolean } {
  if (typeof value !== "string") return {};
  try {
    const body: unknown = JSON.parse(value);
    if (!Array.isArray(body)) return { error: "Article blocks must be a JSON array." };
    if (!validateArticleBlocks(body)) return { error: "One or more article blocks is incomplete, unsafe or uses an unsupported structure." };
    const serialised = JSON.stringify(body);
    if (utf8ByteLength(serialised) > MAX_ARTICLE_BODY_BYTES) {
      return { error: "The article body is too large for safe publication storage." };
    }
    const missingAlt = body.some((block) => block.type === "image" && !block.alt.trim());
    return { value: serialised, blocks: body, missingAlt };
  } catch {
    return { error: "Article blocks contain invalid JSON." };
  }
}

function londonLocalToUtc(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desired;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    candidate += desired - represented;
  }
  const verification = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
  if (
    Number(verification.year) !== year || Number(verification.month) !== month || Number(verification.day) !== day ||
    Number(verification.hour) !== hour || Number(verification.minute) !== minute
  ) return null;
  return candidate;
}

async function scanReady(id: string, key: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!key) return { ok: false, error: "Upload a source PDF before publishing." };
  const object = await privateFiles().head(key);
  if (!object) return { ok: false, error: "The source PDF could not be found in private storage." };
  const job = await database().prepare(
    `SELECT status FROM background_jobs
     WHERE type = 'file_scan' AND json_extract(payload, '$.publicationId') = ?
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(id).first<{ status: string }>();
  if (job?.status !== "succeeded" || object.customMetadata?.scanStatus !== "clean") {
    return {
      ok: false,
      error: job?.status === "failed" || object.customMetadata?.scanStatus === "rejected"
        ? "The source PDF did not pass its external malware scan. Replace the file before publishing."
        : "The source PDF scan is pending or being finalised. Publishing remains locked until both the scan job and stored-file status report clean.",
    };
  }
  return { ok: true };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const publication = await getPublicationAdmin(id);
  if (!publication) return apiError("Publication not found.", 404);
  return Response.json({ ok: true, publication });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const { id } = await params;
  const existing = await getPublicationAdmin(id);
  if (!existing) return apiError("Publication not found.", 404);

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return replaceSource(request, existing, auth.actor.id);
  }

  const payload = await readJsonObject(request);
  if (!payload) return apiError("The publication update could not be read.", 400);
  const intent = stringValue(payload.intent, 30) || "save";

  let title = existing.title;
  let slug = existing.slug;
  let summary = existing.summary;
  let publicationDate = existing.publication_date;
  let authors = existing.authors;
  let chapter = existing.chapter;
  let featured = existing.featured;
  let webBody = existing.web_body;
  let bodyMissingAlt = false;

  if (payload.title !== undefined) {
    title = stringValue(payload.title, 220);
    if (title.length < 3) return apiError("Enter a publication title.", 422);
  }
  if (payload.slug !== undefined) {
    slug = normaliseSlug(payload.slug);
    if (!slug) return apiError("Enter a valid URL slug.", 422);
  }
  if (payload.summary !== undefined) summary = stringValue(payload.summary, 1_200);
  if (payload.publicationDate !== undefined) {
    const parsedDate = Date.parse(`${stringValue(payload.publicationDate, 20)}T12:00:00.000Z`);
    if (!Number.isFinite(parsedDate)) return apiError("Choose a valid publication date.", 422);
    publicationDate = parsedDate;
  }
  if (payload.authors !== undefined) authors = JSON.stringify(splitList(payload.authors));
  if (payload.chapter !== undefined) chapter = stringValue(payload.chapter, 180) || null;
  if (payload.featuredPresent !== undefined) featured = ["on", "true", true].includes(payload.featured as never) ? 1 : 0;

  const parsedBody = parseBody(payload.webBody);
  if (parsedBody.error) return apiError(parsedBody.error, 422);
  if (parsedBody.value !== undefined) webBody = parsedBody.value;
  const storedBody = parseBody(webBody);
  const requiresValidBody = existing.type !== "markets" && ["review", "publish", "schedule"].includes(intent);
  if (requiresValidBody && storedBody.error) return apiError(storedBody.error, 422);
  bodyMissingAlt = storedBody.missingAlt ?? false;
  const bodyChanged = webBody !== existing.web_body;
  if (bodyChanged && (intent === "publish" || intent === "schedule")) {
    return apiError(
      "Save the editorial changes and move the updated report through Review before publishing or scheduling it.",
      409,
    );
  }
  if (bodyChanged && existing.status === "published" && intent === "save") {
    return apiError("Unpublish this report to Draft before changing its public article body.", 409);
  }
  if (bodyChanged && existing.status === "scheduled" && existing.type !== "markets") {
    if (safeJson<unknown[]>(webBody, []).length === 0) return apiError("A scheduled report cannot have an empty article body.", 422);
    if (bodyMissingAlt) return apiError("Every report image needs alternative text while publication is scheduled.", 422);
  }

  const duplicate = await database()
    .prepare("SELECT id FROM publications WHERE slug = ? AND id != ? LIMIT 1")
    .bind(slug, id)
    .first<{ id: string }>();
  if (duplicate) return apiError("That URL slug is already in use. Choose a different slug.", 409);

  let status = existing.status;
  let scheduledAt = existing.scheduled_at;
  let publishedAt = existing.published_at;
  let publishedBy: string | null = null;
  const now = Date.now();

  if (intent === "manual_draft") status = "draft";
  else if (intent === "review") {
    if (existing.type !== "markets" && safeJson<unknown[]>(webBody, []).length === 0) {
      return apiError("Add at least one approved article block before sending this publication to review.", 422);
    }
    status = "review";
  } else if (intent === "publish" || intent === "schedule") {
    if (
      existing.type !== "markets" &&
      existing.status !== "review" &&
      existing.status !== "scheduled"
    ) {
      return apiError(
        "Strategic and Legal reports must be moved to Review before they can be published or scheduled.",
        409,
      );
    }
    if (existing.type !== "markets" && safeJson<unknown[]>(webBody, []).length === 0) {
      return apiError("Strategic and Legal reports need approved web content before publication.", 422);
    }
    if (bodyMissingAlt) return apiError("Every report image needs alternative text before publication.", 422);
    const security = await scanReady(existing.id, existing.source_pdf_key);
    if (!security.ok) return apiError(security.error ?? "The source file is not ready.", 423);

    if (intent === "schedule") {
      const time = londonLocalToUtc(payload.scheduledAt);
      if (!time || time <= now) return apiError("Choose a future Europe/London date and time.", 422);
      status = "scheduled";
      scheduledAt = time;
      publishedAt = null;
    } else {
      status = "published";
      scheduledAt = null;
      publishedAt = now;
      publishedBy = auth.actor.id;
    }
  } else if (intent === "unpublish") {
    status = "draft";
    scheduledAt = null;
    publishedAt = null;
  } else if (intent === "archive") {
    status = "archived";
    scheduledAt = null;
  } else if (intent !== "save") {
    return apiError("Unsupported publication action.", 400);
  }

  const revisionNumber = bodyChanged
    ? ((await database().prepare("SELECT COALESCE(MAX(revision_number), 0) AS value FROM publication_revisions WHERE publication_id = ?").bind(id).first<{ value: number }>())?.value ?? 0) + 1
    : null;
  const statements = [
    database()
      .prepare(
        `UPDATE publications SET title = ?, slug = ?, summary = ?, publication_date = ?,
          authors = ?, chapter = ?, featured = ?, web_body = ?, status = ?, scheduled_at = ?,
          published_at = ?, published_by = COALESCE(?, published_by), updated_by = ?, updated_at = ?,
          search_text = ? WHERE id = ?`,
      )
      .bind(
        title, slug, summary, publicationDate, authors, chapter, featured, webBody, status,
        scheduledAt, publishedAt, publishedBy, auth.actor.id, now,
        publicationSearchText(
          boundedSearchText([title, summary, ...safeJson<string[]>(authors, []), chapter ?? ""]),
          storedBody.blocks ?? [],
        ),
        id,
      ),
  ];
  if (revisionNumber) {
    statements.push(
      database()
        .prepare(
          `INSERT INTO publication_revisions
           (id, publication_id, revision_number, source_pdf_key, web_body, parse_warnings, note, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'Editorial save', ?, ?)`,
        )
        .bind(createId("revision"), id, revisionNumber, existing.source_pdf_key, webBody, existing.parse_warnings, auth.actor.id, now),
    );
  }
  await database().batch(statements);

  const action = intent === "save" ? "publication.updated" : `publication.${intent}`;
  await writeAudit({
    actorId: auth.actor.id,
    action,
    entityType: "publication",
    entityId: id,
    metadata: { fromStatus: existing.status, toStatus: status, revisionCreated: Boolean(revisionNumber) },
  });
  return Response.json({ ok: true, message: intent === "save" ? "Publication saved." : `Publication moved to ${status.replace(/_/g, " ")}.` });
}

async function replaceSource(
  request: Request,
  existing: NonNullable<Awaited<ReturnType<typeof getPublicationAdmin>>>,
  actorId: string,
): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("The replacement upload could not be read.", 400);
  }
  if (form.get("confirmReplace") !== "true") return apiError("Confirm that the source replacement should create a new revision.", 422);
  const source = form.get("sourcePdf");
  if (!(source instanceof File)) return apiError("Choose a replacement PDF.", 422);
  const inspected = await inspectPdf(source, MAX_PUBLICATION_BYTES);
  if (!inspected.ok) return apiError(inspected.error, 422);

  const safeFilename = source.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-140) || "source.pdf";
  const key = `private/publications/${existing.id}/${crypto.randomUUID()}-${safeFilename}`;
  await privateFiles().put(key, inspected.bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { publicationId: existing.id, scanStatus: "quarantined", basicInspection: "passed", originalFilename: safeFilename },
  });

  const now = Date.now();
  const nextRevision = ((await database().prepare("SELECT COALESCE(MAX(revision_number), 0) AS value FROM publication_revisions WHERE publication_id = ?").bind(existing.id).first<{ value: number }>())?.value ?? 0) + 1;
  const warning = existing.type === "markets" ? [] : ["Replacement extraction is waiting for the source file security scan. Prior editorial content has been preserved."];
  try {
    await database().batch([
      database().prepare(
        `INSERT INTO publication_revisions
         (id, publication_id, revision_number, source_pdf_key, web_body, parse_warnings, note, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Source replaced; prior approved content preserved', ?, ?)`,
      ).bind(createId("revision"), existing.id, nextRevision, existing.source_pdf_key, existing.web_body, existing.parse_warnings, actorId, now),
      database().prepare(
        `UPDATE publications SET source_pdf_key = ?, status = 'uploaded', parse_warnings = ?,
          parse_error = NULL, updated_by = ?, updated_at = ? WHERE id = ?`,
      ).bind(key, JSON.stringify(warning), actorId, now, existing.id),
      database().prepare(
        `INSERT INTO background_jobs
         (id, type, status, payload, attempts, run_after, created_at, updated_at)
         VALUES (?, 'file_scan', 'queued', ?, 0, ?, ?, ?)`,
      ).bind(createId("job"), JSON.stringify({ publicationId: existing.id, key, parseAfterScan: existing.type !== "markets", replacement: true }), now, now, now),
    ]);
  } catch (cause) {
    await privateFiles().delete(key);
    throw cause;
  }
  await writeAudit({
    actorId,
    action: "publication.source_replaced",
    entityType: "publication",
    entityId: existing.id,
    metadata: { revisionNumber: nextRevision, scanStatus: "quarantined" },
  });
  return Response.json({ ok: true, message: "Replacement stored. Security scan queued; prior editorial content was preserved." });
}
