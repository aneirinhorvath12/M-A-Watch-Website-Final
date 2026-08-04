import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import { database, privateFiles } from "@/lib/platform";
import { isApplicantCvKey } from "@/lib/recruitment-policy";
import { activeApplicantRetentionSql } from "@/lib/applicant-retention";

export const dynamic = "force-dynamic";

function asciiFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "applicant-cv.pdf";
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const { id } = await params;
  const now = Date.now();
  const applicant = await database()
    .prepare(`SELECT id, cv_key, cv_filename, deletion_requested_at FROM applicants WHERE id = ? AND ${activeApplicantRetentionSql("applicants")} LIMIT 1`)
    .bind(id, now)
    .first<{ id: string; cv_key: string; cv_filename: string; deletion_requested_at: number | null }>();
  if (!applicant) return apiError("Applicant CV not found.", 404);
  if (!isApplicantCvKey(applicant.id, applicant.cv_key)) {
    await writeAudit({
      actorId: auth.actor.id,
      action: "applicant.cv_download_blocked",
      entityType: "applicant",
      entityId: id,
      metadata: { reason: "invalid_private_object_reference" },
    });
    return apiError("Applicant CV not found.", 404);
  }
  if (applicant.deletion_requested_at) {
    await writeAudit({
      actorId: auth.actor.id,
      action: "applicant.cv_download_blocked",
      entityType: "applicant",
      entityId: id,
      metadata: { reason: "deletion_pending" },
    });
    return apiError("This applicant record is pending deletion.", 423);
  }
  const scanJob = await database()
    .prepare(
      `SELECT status, error FROM background_jobs
       WHERE type = 'file_scan' AND json_extract(payload, '$.applicationId') = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(id)
    .first<{ status: "queued" | "running" | "succeeded" | "failed"; error: string | null }>();
  const bucket = privateFiles();
  const metadata = await bucket.head(applicant.cv_key);
  if (!metadata) return apiError("Applicant CV not found in private storage.", 404);
  const scanStatus = scanJob?.status ?? "queued";
  if (scanStatus !== "succeeded" || metadata.customMetadata?.scanStatus !== "clean") {
    await writeAudit({
      actorId: auth.actor.id,
      action: "applicant.cv_download_blocked",
      entityType: "applicant",
      entityId: id,
      metadata: { scanStatus },
    });
    return apiError(
      scanStatus === "failed" || metadata.customMetadata?.scanStatus === "rejected"
        ? "This CV did not pass the external malware scan and cannot be downloaded."
        : "This CV is quarantined while its external malware scan is pending or being finalised. It cannot be downloaded yet.",
      423,
    );
  }
  const file = await bucket.get(applicant.cv_key);
  if (!file || file.customMetadata?.scanStatus !== "clean") {
    return apiError("Applicant CV not found in private storage.", 404);
  }
  await writeAudit({
    actorId: auth.actor.id,
    action: "applicant.cv_downloaded",
    entityType: "applicant",
    entityId: id,
  });
  return new Response(file.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="${asciiFilename(applicant.cv_filename)}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Download-Options": "noopen",
    },
  });
}
