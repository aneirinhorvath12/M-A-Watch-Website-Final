import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest, readJsonObject, stringValue } from "@/lib/admin-api";
import { APPLICANT_STATUSES, type ApplicantStatus } from "@/lib/admin-data";
import { writeAudit } from "@/lib/audit";
import { createId, database } from "@/lib/platform";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  const payload = await readJsonObject(request);
  if (!payload) return apiError("The status update could not be read.", 400);
  const status = stringValue(payload.status, 30) as ApplicantStatus;
  if (!APPLICANT_STATUSES.includes(status)) return apiError("Choose a valid applicant status.", 422);
  const { id } = await params;
  await ensureDatabase();
  const current = await database()
    .prepare("SELECT status FROM applicants WHERE id = ? LIMIT 1")
    .bind(id)
    .first<{ status: ApplicantStatus }>();
  if (!current) return apiError("Applicant not found.", 404);
  if (current.status === status) return Response.json({ ok: true, message: "Status is already up to date." });

  const now = Date.now();
  await database().batch([
    database().prepare("UPDATE applicants SET status = ?, updated_at = ? WHERE id = ?").bind(status, now, id),
    database()
      .prepare(
        `INSERT INTO applicant_status_history
         (id, applicant_id, from_status, to_status, changed_by, changed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(createId("history"), id, current.status, status, auth.actor.id, now),
  ]);
  await writeAudit({
    actorId: auth.actor.id,
    action: "applicant.status_changed",
    entityType: "applicant",
    entityId: id,
    metadata: { fromStatus: current.status, toStatus: status, emailSent: false },
  });
  return Response.json({ ok: true, message: `Applicant moved to ${status}. No email was sent.` });
}
