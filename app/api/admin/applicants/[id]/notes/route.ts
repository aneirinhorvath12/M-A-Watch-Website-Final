import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest, readJsonObject, stringValue } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import { createId, database } from "@/lib/platform";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  const payload = await readJsonObject(request);
  if (!payload) return apiError("The note could not be read.", 400);
  const body = stringValue(payload.body, 4_000);
  if (body.length < 2) return apiError("Write a note before saving.", 422);
  const { id } = await params;
  await ensureDatabase();
  const applicant = await database().prepare("SELECT id FROM applicants WHERE id = ? LIMIT 1").bind(id).first<{ id: string }>();
  if (!applicant) return apiError("Applicant not found.", 404);
  const noteId = createId("note");
  const now = Date.now();
  await database()
    .prepare("INSERT INTO applicant_notes (id, applicant_id, body, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(noteId, id, body, auth.actor.id, now)
    .run();
  await writeAudit({
    actorId: auth.actor.id,
    action: "applicant.note_added",
    entityType: "applicant",
    entityId: id,
    metadata: { noteId },
  });
  return Response.json({ ok: true, message: "Internal note saved." }, { status: 201 });
}
