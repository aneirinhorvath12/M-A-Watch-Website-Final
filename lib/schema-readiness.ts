const REQUIRED_TABLES = new Set([
  "admin_users",
  "publications",
  "publication_revisions",
  "applicants",
  "rate_limits",
  "application_settings",
  "audit_log",
  "background_jobs",
]);

export type SchemaDefinition = { name: string; sql: string | null };

export function hasExpectedSchema(definitions: readonly SchemaDefinition[]): boolean {
  const rows = new Map(definitions.map((row) => [row.name, row.sql ?? ""]));
  const hasRequiredTables = [...REQUIRED_TABLES].every((name) => rows.has(name));
  const hasSubmissionIdempotency = /\bsubmission_key\b/i.test(
    rows.get("applicants") ?? "",
  );
  const applicationsDefaultClosed = /\bopen\b[^,]*DEFAULT\s+(?:false|0)\b/i.test(
    rows.get("application_settings") ?? "",
  );
  return hasRequiredTables && hasSubmissionIdempotency && applicationsDefaultClosed;
}
