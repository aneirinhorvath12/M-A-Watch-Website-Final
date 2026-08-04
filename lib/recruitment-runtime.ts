import { env } from "cloudflare:workers";
import {
  RECRUITMENT_READINESS_MESSAGES,
  recruitmentReadiness,
  type RecruitmentReadiness,
  type RecruitmentRuntimeConfig,
  type RecruitmentSettings,
} from "@/lib/recruitment-policy";
import { resolveEmailProvider } from "@/lib/email-provider";
import { resolveMalwareProvider } from "@/lib/malware-provider";
import { hasRecentMaintenanceSuccess } from "@/lib/maintenance-state";

export type RecruitmentOperationsStatus = {
  emailProvider: "Resend" | "Custom webhook" | null;
  malwareProvider: "Cloudmersive" | "Custom webhook" | null;
  maintenanceSchedulerApproved: boolean;
};

export function currentRecruitmentReadiness(
  settings: RecruitmentSettings,
): RecruitmentReadiness {
  return recruitmentReadiness(
    env as unknown as RecruitmentRuntimeConfig,
    settings,
    { allowLoopbackHttp: process.env.NODE_ENV === "development" },
  );
}

export async function currentRecruitmentIntakeReadiness(
  settings: RecruitmentSettings,
): Promise<RecruitmentReadiness> {
  const readiness = currentRecruitmentReadiness(settings);
  if (
    readiness.issues.includes("retentionAutomation") ||
    (await hasRecentMaintenanceSuccess())
  ) {
    return readiness;
  }
  return {
    ready: false,
    issues: [...readiness.issues, "retentionAutomation"],
    messages: [
      ...readiness.messages,
      RECRUITMENT_READINESS_MESSAGES.retentionAutomation,
    ],
  };
}

/** Provider names only. This never returns endpoints, tokens or secret values. */
export function currentRecruitmentOperationsStatus(): RecruitmentOperationsStatus {
  const runtime = env as unknown as RecruitmentRuntimeConfig & {
    MAINTENANCE_SCHEDULER_ENABLED?: string;
  };
  const email = resolveEmailProvider(runtime, {
    allowLoopbackHttp: process.env.NODE_ENV === "development",
  });
  const malware = resolveMalwareProvider(runtime, {
    allowLoopbackHttp: process.env.NODE_ENV === "development",
  });
  return {
    emailProvider:
      email?.kind === "resend"
        ? "Resend"
        : email?.kind === "webhook"
          ? "Custom webhook"
          : null,
    malwareProvider:
      malware?.kind === "cloudmersive"
        ? "Cloudmersive"
        : malware?.kind === "webhook"
          ? "Custom webhook"
          : null,
    maintenanceSchedulerApproved:
      runtime.MAINTENANCE_SCHEDULER_ENABLED?.trim().toLowerCase() === "true",
  };
}
