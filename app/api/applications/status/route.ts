import { ensureDatabase } from "@/db/bootstrap";
import { database } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureDatabase();
  const settings = await database()
    .prepare(
      `SELECT open, introduction, closed_message, privacy_policy_version
       FROM application_settings WHERE id = 1`,
    )
    .first<{
      open: number;
      introduction: string;
      closed_message: string;
      privacy_policy_version: string;
    }>();

  return Response.json({
    open: Boolean(settings?.open),
    introduction: settings?.introduction ?? "",
    closedMessage: settings?.closed_message ?? "",
    privacyPolicyVersion: settings?.privacy_policy_version ?? "2026-08-04",
  });
}
