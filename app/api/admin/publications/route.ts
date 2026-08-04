import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest, normaliseSlug, splitList } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import { d1LikePattern } from "@/lib/d1-query";
import { createId, database, privateFiles } from "@/lib/platform";
import {
  cleanPlainText,
  inspectPdf,
  MAX_PUBLICATION_BYTES,
  MAX_PUBLICATION_MULTIPART_BYTES,
  normalisePublicationPdfFilename,
  readBoundedMultipartForm,
} from "@/lib/security";

const TYPES = new Set(["strategic", "legal", "markets"]);

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const q = url.searchParams.get("q")?.trim().slice(0, 160) ?? "";
  const conditions: string[] = [];
  const bindings: string[] = [];
  if (TYPES.has(type)) {
    conditions.push("type = ?");
    bindings.push(type);
  }
  if (["uploaded", "parsing", "draft", "review", "scheduled", "published", "archived", "parse_failed"].includes(status)) {
    conditions.push("status = ?");
    bindings.push(status);
  }
  if (q) {
    conditions.push("(title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\')");
    const like = d1LikePattern(q);
    bindings.push(like, like, like);
  }
  const statement = database().prepare(
    `SELECT id, type, title, slug, summary, publication_date, status, scheduled_at,
            parse_warnings, parse_error, updated_at, published_at
     FROM publications ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY updated_at DESC LIMIT 200`,
  );
  const rows = bindings.length ? await statement.bind(...bindings).all() : await statement.all();
  return Response.json({ ok: true, publications: rows.results });
}

export async function POST(request: Request) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  await ensureDatabase();

  const upload = await readBoundedMultipartForm(request, {
    maxBytes: MAX_PUBLICATION_MULTIPART_BYTES,
    invalidMessage: "The publication form could not be read.",
    tooLargeMessage: "The publication upload is too large. PDFs may be up to 30 MB.",
  });
  if (!upload.ok) return apiError(upload.error, upload.status);
  const form = upload.form;

  const type = cleanPlainText(form.get("type"), 20).toLowerCase();
  const title = cleanPlainText(form.get("title"), 220);
  const slug = normaliseSlug(form.get("slug") || title);
  const summary = cleanPlainText(form.get("summary"), 1_200);
  const publicationDateValue = cleanPlainText(form.get("publicationDate"), 20);
  const publicationDate = Date.parse(`${publicationDateValue}T12:00:00.000Z`);
  const authors = splitList(form.get("authors"));
  const chapter = cleanPlainText(form.get("chapter"), 180) || null;
  const featured = form.get("featured") === "on" || form.get("featured") === "true";
  const source = form.get("sourcePdf");

  const fields: Record<string, string> = {};
  if (!TYPES.has(type)) fields.type = "Choose Strategic, Legal or Markets.";
  if (title.length < 3) fields.title = "Enter a publication title.";
  if (!slug) fields.slug = "Enter a valid URL slug.";
  if (!Number.isFinite(publicationDate)) fields.publicationDate = "Choose a valid publication date.";
  if (!(source instanceof File)) fields.sourcePdf = "Attach the source PDF.";
  if (Object.keys(fields).length) return apiError("Check the highlighted publication fields.", 422, { fields });

  const duplicate = await database()
    .prepare("SELECT id FROM publications WHERE slug = ? LIMIT 1")
    .bind(slug)
    .first<{ id: string }>();
  if (duplicate) return apiError("That URL slug is already in use. Choose a different slug.", 409, { fields: { slug: "Already in use." } });

  const inspected = await inspectPdf(source as File, MAX_PUBLICATION_BYTES);
  if (!inspected.ok) return apiError(inspected.error, 422, { fields: { sourcePdf: inspected.error } });

  const id = createId("publication");
  const safeFilename = normalisePublicationPdfFilename((source as File).name);
  const key = `private/publications/${id}/${crypto.randomUUID()}-${safeFilename}`;
  await privateFiles().put(key, inspected.bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: {
      publicationId: id,
      scanStatus: "quarantined",
      basicInspection: "passed",
      originalFilename: safeFilename,
    },
  });

  const now = Date.now();
  // Security scanning is a workflow state, not an editorial/parser warning.
  // Keeping these separate means Admins see a precise action instead of an
  // apparently dismissible warning while the source remains quarantined.
  const warnings: unknown[] = [];
  try {
    await database().batch([
      database()
        .prepare(
          `INSERT INTO publications
           (id, type, title, slug, summary, publication_date, status, authors, chapter,
            source_pdf_key, web_body, parse_warnings, structured_metadata, featured,
            search_text, created_by, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'uploaded', ?, ?, ?, '[]', ?, '{}', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id, type, title, slug, summary, publicationDate, JSON.stringify(authors), chapter,
          key, JSON.stringify(warnings), featured ? 1 : 0,
          [title, summary, ...authors, chapter ?? ""].join(" "),
          auth.actor.id, auth.actor.id, now, now,
        ),
      database()
        .prepare(
          `INSERT INTO publication_revisions
           (id, publication_id, revision_number, source_pdf_key, web_body, parse_warnings, note, created_by, created_at)
           VALUES (?, ?, 1, ?, '[]', ?, 'Initial source upload', ?, ?)`,
        )
        .bind(createId("revision"), id, key, JSON.stringify(warnings), auth.actor.id, now),
      database()
        .prepare(
          `INSERT INTO background_jobs
           (id, type, status, payload, attempts, run_after, created_at, updated_at)
           VALUES (?, 'file_scan', 'queued', ?, 0, ?, ?, ?)`,
        )
        .bind(
          createId("job"),
          JSON.stringify({ publicationId: id, key, parseAfterScan: type !== "markets" }),
          now, now, now,
        ),
    ]);
  } catch (cause) {
    await privateFiles().delete(key);
    if (String(cause).includes("idx_publications_slug")) {
      return apiError("That URL slug is already in use. Choose a different slug.", 409);
    }
    throw cause;
  }

  await writeAudit({
    actorId: auth.actor.id,
    action: "publication.created",
    entityType: "publication",
    entityId: id,
    metadata: { type, scanStatus: "quarantined", parserQueued: type !== "markets" },
  });
  return Response.json({
    ok: true,
    id,
    redirect: `/admin/publications/${id}`,
    message: "Publication created. File security scan queued.",
  }, { status: 201 });
}
