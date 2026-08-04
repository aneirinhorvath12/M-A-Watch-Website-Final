import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLICANT_RETENTION_MS,
  activeApplicantRetentionSql,
  applicantIsWithinRetention,
  effectiveApplicantRetentionDeadline,
} from "../lib/applicant-retention";
import {
  MAINTENANCE_FRESHNESS_MS,
  maintenanceSuccessIsRecent,
} from "../lib/maintenance-policy";

test("effective retention denies explicit and legacy-null deadlines at expiry", () => {
  const submittedAt = 1_000;
  const legacyDeadline = submittedAt + APPLICANT_RETENTION_MS;
  assert.equal(effectiveApplicantRetentionDeadline(null, submittedAt), legacyDeadline);
  assert.equal(applicantIsWithinRetention(null, submittedAt, legacyDeadline - 1), true);
  assert.equal(applicantIsWithinRetention(null, submittedAt, legacyDeadline), false);
  assert.equal(applicantIsWithinRetention(2_000, submittedAt, 2_000), false);
  assert.match(activeApplicantRetentionSql("a"), /COALESCE\(a\.retention_expires_at, a\.submitted_at \+/);
});

test("maintenance freshness rejects missing, stale and future attestations", () => {
  const now = 1_000_000_000;
  assert.equal(maintenanceSuccessIsRecent(null, now), false);
  assert.equal(maintenanceSuccessIsRecent(now - MAINTENANCE_FRESHNESS_MS, now), false);
  assert.equal(maintenanceSuccessIsRecent(now - MAINTENANCE_FRESHNESS_MS + 1, now), true);
  assert.equal(maintenanceSuccessIsRecent(now + 1, now), false);
});
