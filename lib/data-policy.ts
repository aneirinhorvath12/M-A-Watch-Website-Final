/**
 * Public recruitment data policy. Changing either value is a policy change:
 * update the public notices, obtain organisational approval and change the
 * matching hosted approval settings before reopening application intake.
 */
export const CURRENT_APPLICATION_PRIVACY_VERSION = "2026-08-05";
export const APPLICANT_RETENTION_DAYS = 180;

export function applicantRetentionSummary(): string {
  return `${APPLICANT_RETENTION_DAYS} days from submission`;
}
