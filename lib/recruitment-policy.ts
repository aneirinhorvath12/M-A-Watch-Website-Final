import { validatedIntegrationUrl } from "@/lib/integration-security";
import {
  resolveEmailProvider,
  type EmailProviderSecrets,
} from "@/lib/email-provider";
import {
  resolveMalwareProvider,
  type MalwareProviderSecrets,
} from "@/lib/malware-provider";

export const MIN_APPLICANT_RETENTION_DAYS = 1;
export const MAX_APPLICANT_RETENTION_DAYS = 3_650;

export type RecruitmentRuntimeConfig = EmailProviderSecrets &
  MalwareProviderSecrets & {
  NEXT_PUBLIC_SITE_URL?: string;
  APPLICATION_INTAKE_ENABLED?: string;
  APPROVED_APPLICANT_RETENTION_DAYS?: string;
  APPROVED_APPLICATION_PRIVACY_VERSION?: string;
  };

export type RecruitmentSettings = {
  retentionDays: number | null;
  privacyPolicyVersion: string;
  notificationRecipients: readonly string[];
};

export const RECRUITMENT_READINESS_MESSAGES = {
  intakeDisabled:
    "Application intake has not been enabled for this environment.",
  retentionPolicy:
    "The approved applicant retention period is missing or does not match these settings.",
  privacyPolicy:
    "The approved privacy policy version is missing or does not match these settings.",
  email:
    "Transactional email delivery is not securely configured.",
  malwareScan:
    "Malware scanning is not securely configured.",
  recipients:
    "At least one administrator notification recipient is required.",
  siteUrl:
    "The canonical HTTPS site URL is not configured for secure administrator links.",
} as const;

export type RecruitmentReadinessIssue =
  keyof typeof RECRUITMENT_READINESS_MESSAGES;

export type RecruitmentReadiness = {
  ready: boolean;
  issues: RecruitmentReadinessIssue[];
  messages: string[];
};

export function parseApplicantRetentionDays(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_APPLICANT_RETENTION_DAYS ||
    parsed > MAX_APPLICANT_RETENTION_DAYS
  ) {
    return null;
  }
  return parsed;
}

export function applicantRetentionDeadline(
  submittedAt: number,
  retentionDays: number,
): number {
  const validatedDays = parseApplicantRetentionDays(retentionDays);
  if (!Number.isFinite(submittedAt) || validatedDays === null) {
    throw new Error("The applicant retention policy is invalid.");
  }
  return submittedAt + validatedDays * 24 * 60 * 60 * 1_000;
}

export function recruitmentReadiness(
  runtime: RecruitmentRuntimeConfig,
  settings: RecruitmentSettings,
  options: { allowLoopbackHttp?: boolean } = {},
): RecruitmentReadiness {
  const issues: RecruitmentReadinessIssue[] = [];
  const configuredRetentionDays = parseApplicantRetentionDays(
    runtime.APPROVED_APPLICANT_RETENTION_DAYS,
  );
  const emailProvider = resolveEmailProvider(runtime, options);
  const malwareProvider = resolveMalwareProvider(runtime, options);
  const emailEndpoint = emailProvider
    ? validatedIntegrationUrl(emailProvider.endpoint, options)
    : null;
  const scannerEndpoint = malwareProvider
    ? validatedIntegrationUrl(malwareProvider.endpoint, options)
    : null;

  if (runtime.APPLICATION_INTAKE_ENABLED?.trim().toLowerCase() !== "true") {
    issues.push("intakeDisabled");
  }
  if (
    settings.retentionDays === null ||
    configuredRetentionDays === null ||
    settings.retentionDays !== configuredRetentionDays
  ) {
    issues.push("retentionPolicy");
  }
  if (
    !settings.privacyPolicyVersion.trim() ||
    runtime.APPROVED_APPLICATION_PRIVACY_VERSION?.trim() !==
      settings.privacyPolicyVersion.trim()
  ) {
    issues.push("privacyPolicy");
  }
  if (
    !emailEndpoint ||
    !emailProvider ||
    (emailProvider.kind === "webhook" && !emailProvider.token.trim())
  ) {
    issues.push("email");
  }
  if (
    !scannerEndpoint ||
    !malwareProvider ||
    (malwareProvider.kind === "webhook" &&
      !malwareProvider.bearerToken.trim())
  ) {
    issues.push("malwareScan");
  }
  if (!settings.notificationRecipients.length) {
    issues.push("recipients");
  }
  if (!canonicalHttpsSiteUrl(runtime.NEXT_PUBLIC_SITE_URL)) {
    issues.push("siteUrl");
  }

  return {
    ready: issues.length === 0,
    issues,
    messages: issues.map((issue) => RECRUITMENT_READINESS_MESSAGES[issue]),
  };
}

export function canonicalHttpsSiteUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "") ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function secureAdminApplicationUrl(
  siteUrl: unknown,
  applicationPath: unknown,
): string | null {
  const origin = canonicalHttpsSiteUrl(siteUrl);
  if (
    !origin ||
    typeof applicationPath !== "string" ||
    !/^\/admin\/applicants\/application_[0-9a-f-]{36}$/i.test(
      applicationPath,
    )
  ) {
    return null;
  }
  return new URL(applicationPath, origin).toString();
}

export function secureAdminLoginUrl(siteUrl: unknown): string | null {
  const origin = canonicalHttpsSiteUrl(siteUrl);
  return origin ? new URL("/admin/login", origin).toString() : null;
}

export const APPLICANT_DELETION_REASONS = [
  "retention_expired",
  "privacy_request",
  "administrative_request",
] as const;

export type ApplicantDeletionReason =
  (typeof APPLICANT_DELETION_REASONS)[number];

export function isApplicantDeletionReason(
  value: unknown,
): value is ApplicantDeletionReason {
  return (
    typeof value === "string" &&
    (APPLICANT_DELETION_REASONS as readonly string[]).includes(value)
  );
}

export function applicantDeletionJobId(applicantId: string): string {
  return `job_delete_${applicantId}`;
}

export function isApplicantCvKey(
  applicantId: string,
  objectKey: string,
): boolean {
  if (!/^application_[0-9a-f-]{36}$/i.test(applicantId)) return false;
  const prefix = `private/applicants/${applicantId}/`;
  if (!objectKey.startsWith(prefix)) return false;
  const filename = objectKey.slice(prefix.length);
  return filename.length > 0 && /^[a-zA-Z0-9._-]+$/.test(filename);
}
