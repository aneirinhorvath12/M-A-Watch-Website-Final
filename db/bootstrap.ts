import { env } from "cloudflare:workers";
import {
  hasExpectedSchema,
  type SchemaDefinition,
} from "@/lib/schema-readiness";
import {
  APPLICANT_RETENTION_DAYS,
  CURRENT_APPLICATION_PRIVACY_VERSION,
} from "@/lib/data-policy";

let readinessPromise: Promise<void> | null = null;

export async function ensureDatabase(): Promise<void> {
  if (!env.DB) throw new Error("Database binding is unavailable");
  readinessPromise ??= verifyMigratedSchemaAndSeed();
  try {
    await readinessPromise;
  } catch (error) {
    // A transient D1 failure must not poison every later request handled by the
    // same isolate. The next request gets one fresh readiness attempt.
    readinessPromise = null;
    throw error;
  }
}

async function verifyMigratedSchemaAndSeed(): Promise<void> {
  const db = env.DB;
  const schema = await db
    .prepare(
      `SELECT name, sql FROM sqlite_schema
       WHERE type = 'table'
         AND name IN (
           'admin_users', 'publications', 'publication_revisions', 'applicants',
           'applicant_notes', 'applicant_status_history',
           'team_members', 'content_entries', 'rate_limits',
           'application_settings', 'audit_log', 'background_jobs',
           'analytics_daily', 'maintenance_state'
         )`,
    )
    .all<SchemaDefinition>();

  if (!hasExpectedSchema(schema.results)) {
    throw new Error(
      "Database schema is not ready. Apply all checked-in Drizzle migrations before serving requests.",
    );
  }

  await db
    .prepare(
      `INSERT OR IGNORE INTO application_settings
       (id, open, introduction, closed_message, notification_recipients,
        privacy_policy_version, retention_days, updated_at)
       VALUES (1, 0, ?, ?, '[]', ?, ?, ?)`,
    )
    .bind(
      "Join M&A Watch and contribute to student-led analysis of landmark transactions.",
      "Applications are currently closed. Please follow our channels for the next recruitment window.",
      CURRENT_APPLICATION_PRIVACY_VERSION,
      APPLICANT_RETENTION_DAYS,
      Date.now(),
    )
    .run();

  await db
    .prepare(
      `INSERT OR IGNORE INTO maintenance_state
       (id, last_completed_at, updated_at) VALUES (1, NULL, ?)`,
    )
    .bind(Date.now())
    .run();
}

export function resetDatabaseBootstrapForTests() {
  readinessPromise = null;
}
