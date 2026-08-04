import { APPLICANT_RETENTION_DAYS } from "@/lib/data-policy";

/**
 * SQL predicate for records that remain inside their request-time retention
 * boundary. The caller must bind the current epoch milliseconds at `?`.
 * Legacy null deadlines fall back to submission + the current policy period,
 * so an incomplete historical backfill can never retain a record forever.
 */
export const APPLICANT_RETENTION_MS =
  APPLICANT_RETENTION_DAYS * 24 * 60 * 60 * 1_000;

export function applicantRetentionRequestTime(): number {
  return Date.now();
}

export function effectiveApplicantRetentionSql(
  alias: "a" | "duplicate" | "applicants" = "applicants",
): string {
  return `COALESCE(${alias}.retention_expires_at, ${alias}.submitted_at + ${APPLICANT_RETENTION_MS})`;
}

export function activeApplicantRetentionSql(alias: "a" | "duplicate" | "applicants" = "applicants"): string {
  return `${effectiveApplicantRetentionSql(alias)} > ?`;
}

export function applicantIsWithinRetention(
  retentionExpiresAt: number | null,
  submittedAt: number,
  now = Date.now(),
): boolean {
  return effectiveApplicantRetentionDeadline(retentionExpiresAt, submittedAt) > now;
}

export function effectiveApplicantRetentionDeadline(
  retentionExpiresAt: number | null,
  submittedAt: number,
): number {
  return retentionExpiresAt ?? submittedAt + APPLICANT_RETENTION_MS;
}
