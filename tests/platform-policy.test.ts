import assert from "node:assert/strict";
import test from "node:test";
import { jobIdempotencyKey, jobRetryDelayMs } from "../lib/job-policy";
import { validatedIntegrationUrl } from "../lib/integration-security";
import { hasValidMaintenanceToken } from "../lib/maintenance-auth";
import { validatePublicationRevision } from "../lib/publication-revision-validation";
import { hasExpectedSchema, type SchemaDefinition } from "../lib/schema-readiness";
import { boundedSearchText, utf8ByteLength } from "../lib/text-limits";

test("job retries use bounded exponential backoff", () => {
  assert.equal(jobRetryDelayMs(1), 60_000);
  assert.equal(jobRetryDelayMs(2), 120_000);
  assert.equal(jobRetryDelayMs(30), 3_600_000);
});

test("provider idempotency keys are stable and job-specific", () => {
  assert.equal(
    jobIdempotencyKey({ id: "job_123", type: "email" }),
    "ma-watch:email:job_123",
  );
  assert.notEqual(
    jobIdempotencyKey({ id: "job_123", type: "email" }),
    jobIdempotencyKey({ id: "job_124", type: "email" }),
  );
});

test("maintenance authentication accepts only an exact bearer token", async () => {
  const request = (authorization?: string) =>
    new Request("https://mawatch.org/api/maintenance", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    });
  assert.equal(
    await hasValidMaintenanceToken(request("Bearer expected-token"), "expected-token"),
    true,
  );
  assert.equal(
    await hasValidMaintenanceToken(request("Bearer wrong-token"), "expected-token"),
    false,
  );
  assert.equal(
    await hasValidMaintenanceToken(request("Basic expected-token"), "expected-token"),
    false,
  );
  assert.equal(await hasValidMaintenanceToken(request(), "expected-token"), false);
  assert.equal(
    await hasValidMaintenanceToken(request("Bearer expected-token"), undefined),
    false,
  );
});

test("integration endpoints require HTTPS except explicit local development", () => {
  assert.equal(
    validatedIntegrationUrl("https://provider.example/hooks/email"),
    "https://provider.example/hooks/email",
  );
  assert.equal(validatedIntegrationUrl("http://provider.example/hooks/email"), null);
  assert.equal(validatedIntegrationUrl("http://localhost:8787/hook"), null);
  assert.equal(
    validatedIntegrationUrl("http://127.0.0.1:8787/hook", {
      allowLoopbackHttp: true,
    }),
    "http://127.0.0.1:8787/hook",
  );
});

test("UTF-8 limits do not split code points or exceed the D1 search budget", () => {
  const result = boundedSearchText(["deal", "😀".repeat(20_000)]);
  assert.ok(utf8ByteLength(result) <= 24_000);
  assert.doesNotMatch(result, /\uFFFD/);
});

test("publication revisions are canonicalised and rejected when unsafe or oversized", () => {
  const valid = validatePublicationRevision(
    JSON.stringify([
      {
        id: "intro",
        type: "paragraph",
        content: [{ text: "A safe candidate." }],
      },
    ]),
    JSON.stringify([{ message: "Check the source." }]),
  );
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(JSON.parse(valid.value.webBody)[0].id, "intro");
    assert.equal(Array.isArray(JSON.parse(valid.value.parseWarnings)), true);
  }

  assert.equal(
    validatePublicationRevision(
      JSON.stringify([
        {
          id: "unsafe-link",
          type: "paragraph",
          content: [{ text: "Click", href: "javascript:alert(1)" }],
        },
      ]),
      "[]",
    ).ok,
    false,
  );
  assert.equal(validatePublicationRevision("[]", "{}").ok, false);
  assert.equal(validatePublicationRevision(` ${" ".repeat(750_000)}[]`, "[]").ok, false);
});

test("database readiness requires the migration-owned security fields", () => {
  const definitions: SchemaDefinition[] = [
    "admin_users",
    "publications",
    "publication_revisions",
    "applicant_notes",
    "applicant_status_history",
    "team_members",
    "content_entries",
    "rate_limits",
    "audit_log",
    "background_jobs",
  ].map((name) => ({
    name,
    sql:
      name === "background_jobs"
        ? "CREATE TABLE background_jobs (id TEXT, claim_token TEXT)"
        : `CREATE TABLE ${name} (id TEXT)`,
  }));
  definitions.push(
    {
      name: "analytics_daily",
      sql: "CREATE TABLE analytics_daily (day TEXT, event TEXT, dimension_name TEXT, dimension_value TEXT, count INTEGER, PRIMARY KEY (day, event, dimension_name, dimension_value))",
    },
    {
      name: "applicants",
      sql: "CREATE TABLE applicants (id TEXT, submission_key TEXT NOT NULL, retention_expires_at INTEGER, deletion_requested_at INTEGER)",
    },
    {
      name: "application_settings",
      sql: "CREATE TABLE application_settings (id INTEGER, open INTEGER DEFAULT false, retention_days INTEGER)",
    },
  );
  assert.equal(hasExpectedSchema(definitions), true);
  assert.equal(
    hasExpectedSchema(
      definitions.map((definition) =>
        definition.name === "applicants"
          ? { ...definition, sql: "CREATE TABLE applicants (id TEXT)" }
          : definition,
      ),
    ),
    false,
  );
  assert.equal(
    hasExpectedSchema(
      definitions.filter((definition) => definition.name !== "analytics_daily"),
    ),
    false,
  );
  assert.equal(
    hasExpectedSchema(
      definitions.filter((definition) => definition.name !== "content_entries"),
    ),
    false,
  );
  assert.equal(
    hasExpectedSchema(
      definitions.map((definition) =>
        definition.name === "background_jobs"
          ? { ...definition, sql: "CREATE TABLE background_jobs (id TEXT)" }
          : definition,
      ),
    ),
    false,
  );
});
