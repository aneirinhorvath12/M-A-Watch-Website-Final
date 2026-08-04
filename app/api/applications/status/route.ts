import { ensureDatabase } from "@/db/bootstrap";
import { database, safeJson } from "@/lib/platform";
import { currentRecruitmentIntakeReadiness } from "@/lib/recruitment-runtime";
import { CURRENT_APPLICATION_PRIVACY_VERSION } from "@/lib/data-policy";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureDatabase();
  const settings = await database()
    .prepare(
      `SELECT open, introduction, closed_message, notification_recipients,
              privacy_policy_version, retention_days
       FROM application_settings WHERE id = 1`,
    )
    .first<{
      open: number;
      introduction: string;
      closed_message: string;
      notification_recipients: string;
      privacy_policy_version: string;
      retention_days: number | null;
    }>();
  const readiness = settings
    ? await currentRecruitmentIntakeReadiness({
        retentionDays: settings.retention_days,
        privacyPolicyVersion: settings.privacy_policy_version,
        notificationRecipients: safeJson<string[]>(
          settings.notification_recipients,
          [],
        ),
      })
    : null;

  return Response.json(
    {
      open: Boolean(settings?.open) && Boolean(readiness?.ready),
      introduction: settings?.introduction ?? "",
      closedMessage: settings?.closed_message ?? "",
      privacyPolicyVersion:
        settings?.privacy_policy_version ?? CURRENT_APPLICATION_PRIVACY_VERSION,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
