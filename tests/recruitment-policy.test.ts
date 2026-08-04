import assert from "node:assert/strict";
import test from "node:test";
import {
  applicantDeletionJobId,
  applicantRetentionDeadline,
  secureAdminLoginUrl,
  secureAdminApplicationUrl,
  isApplicantCvKey,
  isApplicantDeletionReason,
  parseApplicantRetentionDays,
  recruitmentReadiness,
  type RecruitmentRuntimeConfig,
  type RecruitmentSettings,
} from "../lib/recruitment-policy";

const settings: RecruitmentSettings = {
  retentionDays: 180,
  privacyPolicyVersion: "approved-2026-08",
  notificationRecipients: ["recruitment@mawatch.org"],
};

const genericRuntime: RecruitmentRuntimeConfig = {
  NEXT_PUBLIC_SITE_URL: "https://ma-watch.example",
  APPLICATION_INTAKE_ENABLED: "true",
  APPROVED_APPLICANT_RETENTION_DAYS: "180",
  APPROVED_APPLICATION_PRIVACY_VERSION: "approved-2026-08",
  EMAIL_WEBHOOK_URL: "https://email.example.test/send",
  EMAIL_WEBHOOK_TOKEN: "email-secret",
  MALWARE_SCAN_WEBHOOK_URL: "https://scanner.example.test/scan",
  MALWARE_SCAN_WEBHOOK_TOKEN: "scanner-secret",
};

test("application intake is ready only when policy and secure providers match", () => {
  assert.deepEqual(recruitmentReadiness(genericRuntime, settings), {
    ready: true,
    issues: [],
    messages: [],
  });

  const blocked = recruitmentReadiness({}, settings);
  assert.equal(blocked.ready, false);
  assert.deepEqual(blocked.issues.sort(), [
    "email",
    "intakeDisabled",
    "malwareScan",
    "privacyPolicy",
    "retentionPolicy",
    "siteUrl",
  ].sort());
  assert.equal(
    blocked.messages.some((message) => message.includes("secret")),
    false,
  );
});

test("direct Resend and Cloudmersive providers satisfy the intake gate", () => {
  const runtime: RecruitmentRuntimeConfig = {
    NEXT_PUBLIC_SITE_URL: "https://ma-watch.example",
    APPLICATION_INTAKE_ENABLED: "true",
    APPROVED_APPLICANT_RETENTION_DAYS: "180",
    APPROVED_APPLICATION_PRIVACY_VERSION: "approved-2026-08",
    RESEND_API_KEY: "resend-secret",
    EMAIL_FROM: "M&A Watch <applications@mawatch.org>",
    CLOUDMERSIVE_API_KEY: "cloudmersive-secret",
  };
  assert.equal(recruitmentReadiness(runtime, settings).ready, true);
});

test("administrator application links are canonical HTTPS URLs", () => {
  const id = "application_123e4567-e89b-12d3-a456-426614174000";
  assert.equal(
    secureAdminApplicationUrl(
      "https://ma-watch.example",
      `/admin/applicants/${id}`,
    ),
    `https://ma-watch.example/admin/applicants/${id}`,
  );
  assert.equal(
    secureAdminApplicationUrl(
      "http://ma-watch.example",
      `/admin/applicants/${id}`,
    ),
    null,
  );
  assert.equal(
    secureAdminApplicationUrl(
      "https://ma-watch.example",
      "https://attacker.example/admin",
    ),
    null,
  );
  assert.equal(
    secureAdminLoginUrl("https://ma-watch.example"),
    "https://ma-watch.example/admin/login",
  );
  assert.equal(secureAdminLoginUrl("https://ma-watch.example/path"), null);
});

test("intake blocks mismatched policy, insecure endpoints and missing recipients", () => {
  const readiness = recruitmentReadiness(
    {
      ...genericRuntime,
      APPROVED_APPLICANT_RETENTION_DAYS: "90",
      APPROVED_APPLICATION_PRIVACY_VERSION: "different-policy",
      EMAIL_WEBHOOK_URL: "http://email.example.test/send",
      MALWARE_SCAN_WEBHOOK_URL: "not-a-url",
    },
    { ...settings, notificationRecipients: [] },
  );
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.issues.sort(), [
    "email",
    "malwareScan",
    "privacyPolicy",
    "recipients",
    "retentionPolicy",
  ].sort());
});

test("retention calculations accept bounded whole days", () => {
  assert.equal(parseApplicantRetentionDays("180"), 180);
  assert.equal(parseApplicantRetentionDays(3650), 3650);
  assert.equal(parseApplicantRetentionDays("0"), null);
  assert.equal(parseApplicantRetentionDays("1.5"), null);
  assert.equal(parseApplicantRetentionDays("3651"), null);
  assert.equal(applicantRetentionDeadline(1_000, 2), 172_801_000);
  assert.throws(() => applicantRetentionDeadline(1_000, 0));
});

test("applicant deletion helpers constrain reasons and private object keys", () => {
  const id = "application_123e4567-e89b-12d3-a456-426614174000";
  const key = `private/applicants/${id}/123e4567-e89b-12d3-a456-426614174001-cv.pdf`;
  assert.equal(isApplicantCvKey(id, key), true);
  assert.equal(
    isApplicantCvKey(id, `private/publications/${id}/cv.pdf`),
    false,
  );
  assert.equal(
    isApplicantCvKey(id, `private/applicants/${id}/../other.pdf`),
    false,
  );
  assert.equal(isApplicantDeletionReason("privacy_request"), true);
  assert.equal(isApplicantDeletionReason("erase_everything"), false);
  assert.equal(
    applicantDeletionJobId(id),
    `job_delete_${id}`,
  );
});
