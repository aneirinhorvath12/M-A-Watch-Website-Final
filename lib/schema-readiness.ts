const REQUIRED_TABLES = new Set([
  "admin_users",
  "publications",
  "publication_revisions",
  "applicants",
  "applicant_notes",
  "applicant_status_history",
  "team_members",
  "content_entries",
  "rate_limits",
  "application_settings",
  "audit_log",
  "background_jobs",
  "analytics_daily",
  "maintenance_state",
]);

export type SchemaDefinition = { name: string; sql: string | null };

export function hasExpectedSchema(definitions: readonly SchemaDefinition[]): boolean {
  const rows = new Map(definitions.map((row) => [row.name, row.sql ?? ""]));
  const hasRequiredTables = [...REQUIRED_TABLES].every((name) => rows.has(name));
  const hasSubmissionIdempotency = /\bsubmission_key\b/i.test(
    rows.get("applicants") ?? "",
  );
  const hasApplicantRetention =
    /\bretention_expires_at\b/i.test(rows.get("applicants") ?? "") &&
    /\bdeletion_requested_at\b/i.test(rows.get("applicants") ?? "");
  const applicationsDefaultClosed = /\bopen\b[^,]*DEFAULT\s+(?:false|0)\b/i.test(
    rows.get("application_settings") ?? "",
  );
  const hasRetentionPolicy = /\bretention_days\b/i.test(
    rows.get("application_settings") ?? "",
  );
  const hasAggregateAnalytics =
    /\bdimension_name\b/i.test(rows.get("analytics_daily") ?? "") &&
    /\bdimension_value\b/i.test(rows.get("analytics_daily") ?? "") &&
    /PRIMARY\s+KEY\s*\([^)]*\bday\b[^)]*\bevent\b[^)]*\bdimension_name\b[^)]*\bdimension_value\b/i.test(
      rows.get("analytics_daily") ?? "",
    );
  const hasFencedJobClaims = /\bclaim_token\b/i.test(
    rows.get("background_jobs") ?? "",
  );
  const hasMaintenanceHeartbeat = /\blast_completed_at\b/i.test(
    rows.get("maintenance_state") ?? "",
  );
  return (
    hasRequiredTables &&
    hasSubmissionIdempotency &&
    hasApplicantRetention &&
    applicationsDefaultClosed &&
    hasRetentionPolicy &&
    hasAggregateAnalytics &&
    hasFencedJobClaims &&
    hasMaintenanceHeartbeat
  );
}
