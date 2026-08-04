import { env } from "cloudflare:workers";
import {
  hasExpectedSchema,
  type SchemaDefinition,
} from "@/lib/schema-readiness";

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
           'rate_limits', 'application_settings', 'audit_log', 'background_jobs'
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
        privacy_policy_version, updated_at)
       VALUES (1, 0, ?, ?, '[]', '2026-08-04', ?)`,
    )
    .bind(
      "Join M&A Watch and contribute to student-led analysis of landmark transactions.",
      "Applications are currently closed. Please follow our channels for the next recruitment window.",
      Date.now(),
    )
    .run();
}

export function resetDatabaseBootstrapForTests() {
  readinessPromise = null;
}
