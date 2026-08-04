import { ensureDatabase } from "@/db/bootstrap";
import {
  apiError,
  authorizeAdminRequest,
  readJsonObject,
} from "@/lib/admin-api";
import { createId, database, safeJson } from "@/lib/platform";
import { validatePublicationRevision } from "@/lib/publication-revision-validation";
import { publicationSearchText } from "@/lib/publication-search-text";
import { boundedSearchText } from "@/lib/text-limits";

export const dynamic = "force-dynamic";

type CurrentPublication = {
  id: string;
  title: string;
  summary: string;
  authors: string;
  chapter: string | null;
  source_pdf_key: string | null;
  web_body: string;
  parse_warnings: string;
  status: string;
  updated_at: number;
};

type RevisionCandidate = {
  id: string;
  revision_number: number;
  web_body: string;
  parse_warnings: string;
};

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; revisionId: string }> },
) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;

  const payload = await readJsonObject(request);
  if (!payload || payload.confirmApply !== "true") {
    return apiError("Confirm that this revision should replace the current draft.", 422);
  }

  await ensureDatabase();
  const { id, revisionId } = await params;
  const db = database();
  const [current, candidate] = await Promise.all([
    db
      .prepare(
        `SELECT id, title, summary, authors, chapter, source_pdf_key, web_body,
                parse_warnings, status, updated_at
         FROM publications WHERE id = ? LIMIT 1`,
      )
      .bind(id)
      .first<CurrentPublication>(),
    db
      .prepare(
        `SELECT id, revision_number, web_body, parse_warnings
         FROM publication_revisions
         WHERE id = ? AND publication_id = ? LIMIT 1`,
      )
      .bind(revisionId, id)
      .first<RevisionCandidate>(),
  ]);
  if (!current) return apiError("Publication not found.", 404);
  if (!candidate) return apiError("Revision not found.", 404);

  const validated = validatePublicationRevision(
    candidate.web_body,
    candidate.parse_warnings,
  );
  if (!validated.ok) return apiError(validated.error, 422);
  if (
    validated.value.webBody === current.web_body &&
    validated.value.parseWarnings === current.parse_warnings &&
    current.status === "draft"
  ) {
    return apiError("This revision is already the current draft.", 409);
  }

  const authors = safeJson<unknown[]>(current.authors, []).filter(
    (author): author is string => typeof author === "string",
  );
  const searchText = publicationSearchText(
    boundedSearchText([
      current.title,
      current.summary,
      ...authors,
      current.chapter ?? "",
    ]),
    validated.value.blocks,
  );
  const now = Date.now();
  const snapshotRevisionId = createId("revision");
  const auditId = createId("audit");
  const snapshotNote = `Snapshot before applying revision #${candidate.revision_number}`;
  const auditMetadata = JSON.stringify({
    actorId: auth.actor.id,
    appliedRevisionId: candidate.id,
    appliedRevisionNumber: candidate.revision_number,
    snapshotRevisionId,
    fromStatus: current.status,
    toStatus: "draft",
  });

  let results: D1Result[];
  try {
    results = await db.batch([
      db
        .prepare(
          `INSERT INTO publication_revisions
           (id, publication_id, revision_number, source_pdf_key, web_body,
            parse_warnings, note, created_by, created_at)
           SELECT ?, publication.id,
             (SELECT COALESCE(MAX(revision_number), 0) + 1
              FROM publication_revisions WHERE publication_id = publication.id),
             publication.source_pdf_key, publication.web_body,
             publication.parse_warnings, ?, ?, ?
           FROM publications publication
           WHERE publication.id = ? AND publication.updated_at = ?
             AND EXISTS (
               SELECT 1 FROM publication_revisions candidate
               WHERE candidate.id = ? AND candidate.publication_id = publication.id
             )`,
        )
        .bind(
          snapshotRevisionId,
          snapshotNote,
          auth.actor.id,
          now,
          id,
          current.updated_at,
          candidate.id,
        ),
      db
        .prepare(
          `UPDATE publications
           SET web_body = ?, parse_warnings = ?, parse_error = NULL,
               status = 'draft', scheduled_at = NULL, published_at = NULL,
               search_text = ?, updated_by = ?, updated_at = ?
           WHERE id = ? AND updated_at = ?
             AND EXISTS (
               SELECT 1 FROM publication_revisions candidate
               WHERE candidate.id = ? AND candidate.publication_id = publications.id
             )`,
        )
        .bind(
          validated.value.webBody,
          validated.value.parseWarnings,
          searchText,
          auth.actor.id,
          now,
          id,
          current.updated_at,
          candidate.id,
        ),
      db
        .prepare(
          `INSERT INTO audit_log
           (id, actor_id, action, entity_type, entity_id, metadata, created_at)
           SELECT ?, ?, 'publication.revision_applied', 'publication',
                  publication.id, ?, ?
           FROM publications publication
           WHERE publication.id = ? AND publication.updated_at = ?
             AND publication.updated_by = ? AND publication.status = 'draft'
             AND EXISTS (
               SELECT 1 FROM publication_revisions snapshot
               WHERE snapshot.id = ? AND snapshot.publication_id = publication.id
             )`,
        )
        .bind(
          auditId,
          auth.actor.id,
          auditMetadata,
          now,
          id,
          now,
          auth.actor.id,
          snapshotRevisionId,
        ),
    ]);
  } catch {
    return apiError(
      "The publication changed while this revision was being applied. Refresh and try again.",
      409,
    );
  }

  if ((results[1]?.meta.changes ?? 0) !== 1) {
    return apiError(
      "The publication changed while this revision was being applied. Refresh and try again.",
      409,
    );
  }

  return Response.json({
    ok: true,
    message: `Revision #${candidate.revision_number} applied. The previous body was retained as a new snapshot and the publication is now Draft.`,
  });
}
