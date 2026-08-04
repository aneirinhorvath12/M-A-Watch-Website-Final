import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest, readJsonObject, splitList, stringValue } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import { database, normaliseEmail, safeJson } from "@/lib/platform";
import { parseApplicantRetentionDays } from "@/lib/recruitment-policy";
import { currentRecruitmentReadiness } from "@/lib/recruitment-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const settings = await database().prepare("SELECT * FROM application_settings WHERE id = 1").first();
  const row = settings as
    | {
        notification_recipients?: string;
        privacy_policy_version?: string;
        retention_days?: number | null;
      }
    | null;
  const readiness = currentRecruitmentReadiness({
    retentionDays: row?.retention_days ?? null,
    privacyPolicyVersion: row?.privacy_policy_version ?? "",
    notificationRecipients: safeJson<string[]>(
      row?.notification_recipients,
      [],
    ),
  });
  return Response.json(
    { ok: true, settings, readiness },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function PATCH(request: Request) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  const payload = await readJsonObject(request);
  if (!payload) return apiError("The application settings could not be read.", 400);
  await ensureDatabase();
  const current = await database()
    .prepare("SELECT open, introduction, closed_message, notification_recipients, privacy_policy_version, retention_days FROM application_settings WHERE id = 1")
    .first<{ open: number; introduction: string; closed_message: string; notification_recipients: string; privacy_policy_version: string; retention_days: number | null }>();
  if (!current) return apiError("Application settings are unavailable.", 500);

  const open = payload.openPresent !== undefined ? ["on", "true", true].includes(payload.open as never) : Boolean(current.open);
  const introduction = payload.introduction === undefined ? current.introduction : stringValue(payload.introduction, 4_000);
  const closedMessage = payload.closedMessage === undefined ? current.closed_message : stringValue(payload.closedMessage, 2_000);
  const privacyPolicyVersion = payload.privacyPolicyVersion === undefined ? current.privacy_policy_version : stringValue(payload.privacyPolicyVersion, 60);
  const rawRetentionDays = payload.retentionDays;
  const retentionDays = rawRetentionDays === undefined
    ? current.retention_days
    : parseApplicantRetentionDays(rawRetentionDays);
  const rawRecipients = payload.notificationRecipients === undefined
    ? safeJson<string[]>(current.notification_recipients, [])
    : splitList(payload.notificationRecipients, 30).map(normaliseEmail);
  const invalid = rawRecipients.find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (invalid) return apiError(`Notification recipient “${invalid}” is not a valid email address.`, 422);
  if (!introduction) return apiError("Add introductory application copy.", 422);
  if (!closedMessage) return apiError("Add a message for closed applications.", 422);
  if (!privacyPolicyVersion) return apiError("Add the current privacy policy version.", 422);
  if (
    rawRetentionDays !== undefined &&
    String(rawRetentionDays).trim() &&
    retentionDays === null
  ) {
    return apiError("Applicant retention must be a whole number from 1 to 3650 days.", 422);
  }
  const readiness = currentRecruitmentReadiness({
    retentionDays,
    privacyPolicyVersion,
    notificationRecipients: rawRecipients,
  });
  if (open && !readiness.ready) {
    return apiError(
      `Applications cannot be opened. ${readiness.messages.join(" ")}`,
      409,
      { readiness: readiness.issues },
    );
  }

  const now = Date.now();
  const db = database();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE application_settings SET open = ?, introduction = ?, closed_message = ?,
         notification_recipients = ?, privacy_policy_version = ?, retention_days = ?,
         updated_by = ?, updated_at = ? WHERE id = 1`,
      )
      .bind(
        open ? 1 : 0,
        introduction,
        closedMessage,
        JSON.stringify(rawRecipients),
        privacyPolicyVersion,
        retentionDays,
        auth.actor.id,
        now,
      ),
  ];
  if (retentionDays !== null) {
    statements.push(
      db
        .prepare(
          `UPDATE applicants
           SET retention_expires_at = submitted_at + ?, updated_at = ?
           WHERE retention_expires_at IS NULL AND deletion_requested_at IS NULL`,
        )
        .bind(retentionDays * 24 * 60 * 60 * 1_000, now),
    );
  }
  await db.batch(statements);
  await writeAudit({
    actorId: auth.actor.id,
    action: current.open === (open ? 1 : 0) ? "application_settings.updated" : open ? "applications.opened" : "applications.closed",
    entityType: "application_settings",
    entityId: "1",
    metadata: {
      fromOpen: Boolean(current.open),
      toOpen: open,
      notificationRecipientCount: rawRecipients.length,
      retentionDays,
      privacyPolicyVersion,
    },
  });
  return Response.json({ ok: true, message: open ? "Application form settings saved; the form is open." : "Application form settings saved; the form is closed." });
}
