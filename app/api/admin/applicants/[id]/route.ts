import { ensureDatabase } from "@/db/bootstrap";
import {
  apiError,
  authorizeAdminRequest,
  readJsonObject,
} from "@/lib/admin-api";
import { createId, database } from "@/lib/platform";
import {
  applicantDeletionJobId,
  isApplicantCvKey,
  isApplicantDeletionReason,
} from "@/lib/recruitment-policy";
import { effectiveApplicantRetentionDeadline } from "@/lib/applicant-retention";

export const dynamic = "force-dynamic";

type ApplicantDeletionRow = {
  id: string;
  cv_key: string;
  submitted_at: number;
  retention_expires_at: number | null;
  deletion_requested_at: number | null;
};

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeAdminRequest(request, {
    mutation: true,
    superUser: true,
  });
  if (!auth.ok) return auth.response;
  const payload = await readJsonObject(request);
  if (!payload) return apiError("The deletion request could not be read.", 400);
  const { id } = await params;
  if (payload.confirmation !== id) {
    return apiError("Type the application ID exactly to confirm deletion.", 422);
  }
  if (!isApplicantDeletionReason(payload.reason)) {
    return apiError("Choose a valid deletion reason.", 422);
  }

  await ensureDatabase();
  const applicant = await database()
    .prepare(
      `SELECT id, cv_key, submitted_at, retention_expires_at,
              deletion_requested_at
       FROM applicants WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<ApplicantDeletionRow>();
  if (!applicant) return apiError("Applicant not found.", 404);
  if (!isApplicantCvKey(applicant.id, applicant.cv_key)) {
    return apiError("The applicant's private file reference is invalid.", 500);
  }
  if (
    payload.reason === "retention_expired" &&
    effectiveApplicantRetentionDeadline(
      applicant.retention_expires_at,
      applicant.submitted_at,
    ) > Date.now()
  ) {
    return apiError("This applicant has not reached the recorded retention date.", 409);
  }
  let requeueFailedDeletion = false;
  if (applicant.deletion_requested_at) {
    const deletionJob = await database()
      .prepare("SELECT status FROM background_jobs WHERE id = ? LIMIT 1")
      .bind(applicantDeletionJobId(id))
      .first<{ status: string }>();
    if (deletionJob && deletionJob.status !== "failed") {
      return Response.json({
        ok: true,
        message: "Deletion is already queued.",
        redirect: "/admin/applicants",
      });
    }
    requeueFailedDeletion = true;
  }

  const now = Date.now();
  const jobId = applicantDeletionJobId(id);
  const jobPayload = JSON.stringify({
    applicationId: id,
    key: applicant.cv_key,
    reason: payload.reason,
  });
  const db = database();
  await db.batch([
    db
      .prepare(
        `UPDATE applicants
         SET deletion_requested_at = ?, deletion_requested_by = ?, updated_at = ?
         WHERE id = ? AND deletion_requested_at IS NULL`,
      )
      .bind(now, auth.actor.id, now, id),
    db
      .prepare(
        `INSERT INTO background_jobs
         (id, type, status, payload, attempts, run_after, created_at, updated_at)
         VALUES (?, 'applicant_delete', 'queued', ?, 0, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = CASE WHEN background_jobs.status = 'failed' THEN 'queued' ELSE background_jobs.status END,
           payload = CASE WHEN background_jobs.status = 'failed' THEN excluded.payload ELSE background_jobs.payload END,
           attempts = CASE WHEN background_jobs.status = 'failed' THEN 0 ELSE background_jobs.attempts END,
           error = CASE WHEN background_jobs.status = 'failed' THEN NULL ELSE background_jobs.error END,
           run_after = CASE WHEN background_jobs.status = 'failed' THEN excluded.run_after ELSE background_jobs.run_after END,
           updated_at = excluded.updated_at`,
      )
      .bind(jobId, jobPayload, now, now, now),
    db
      .prepare(
        `INSERT INTO audit_log
         (id, actor_id, action, entity_type, entity_id, metadata, created_at)
         VALUES (?, ?, ?, 'applicant', ?, ?, ?)`,
      )
      .bind(
        createId("audit"),
        auth.actor.id,
        requeueFailedDeletion
          ? "applicant.deletion_requeued"
          : "applicant.deletion_requested",
        id,
        JSON.stringify({
          reason: payload.reason,
          retentionExpiresAt: applicant.retention_expires_at,
        }),
        now,
      ),
  ]);

  return Response.json({
    ok: true,
    message: "Permanent applicant and CV deletion has been queued.",
    redirect: "/admin/applicants",
  });
}
