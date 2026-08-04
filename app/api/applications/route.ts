import { ensureDatabase } from "@/db/bootstrap";
import type { EmailJob } from "@/lib/email-queue";
import {
  createId,
  database,
  normaliseEmail,
  privateFiles,
  safeJson,
} from "@/lib/platform";
import {
  cleanPlainText,
  hasSafeRequestOrigin,
  inspectPdf,
  MAX_CV_BYTES,
  MAX_CV_MULTIPART_BYTES,
  readBoundedMultipartForm,
  rateLimit,
} from "@/lib/security";
import {
  applicantRetentionDeadline,
  isApplicantCvKey,
} from "@/lib/recruitment-policy";
import { currentRecruitmentIntakeReadiness } from "@/lib/recruitment-runtime";
import { getPublishedSiteContact } from "@/lib/public-content";

const DIVISIONS = new Set(["law", "finance", "markets"]);

type ApplicationSettingsSnapshot = {
  open: number;
  notification_recipients: string;
  privacy_policy_version: string;
  retention_days: number | null;
};

type ReadyApplicationSettingsSnapshot = Omit<
  ApplicationSettingsSnapshot,
  "retention_days"
> & { retention_days: number };

type ApplicationIntakeGate =
  | {
      ok: true;
      settings: ReadyApplicationSettingsSnapshot;
      recipients: string[];
    }
  | { ok: false; response: Response };

export async function POST(request: Request) {
  if (!hasSafeRequestOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  if (!(await rateLimit(request, "application-submit", 6, 15 * 60 * 1000))) {
    return Response.json(
      { error: "Too many attempts. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }
  await ensureDatabase();
  const initialGate = await applicationIntakeGate();
  if (!initialGate.ok) return initialGate.response;
  const { settings, recipients } = initialGate;

  const upload = await readBoundedMultipartForm(request, {
    maxBytes: MAX_CV_MULTIPART_BYTES,
    invalidMessage: "The submitted form could not be read.",
    tooLargeMessage: "The submitted application is too large. CVs may be up to 10 MB.",
  });
  if (!upload.ok) {
    return Response.json({ error: upload.error }, { status: upload.status });
  }
  const form = upload.form;

  if (cleanPlainText(form.get("website"), 200)) {
    return Response.json({ ok: true }, { status: 201 });
  }
  const startedAt = Number(form.get("formStartedAt") ?? 0);
  if (startedAt && Date.now() - startedAt < 1_500) {
    return Response.json({ error: "Please review the form before submitting." }, { status: 400 });
  }

  const name = cleanPlainText(form.get("name"), 120);
  const university = cleanPlainText(form.get("university"), 180);
  const email = normaliseEmail(cleanPlainText(form.get("email"), 254));
  const division = cleanPlainText(form.get("division"), 20).toLowerCase();
  const consent = form.get("privacyConsent");
  const cv = form.get("cv");
  const submissionKey = cleanPlainText(form.get("submissionKey"), 100) || crypto.randomUUID();
  const errors: Record<string, string> = {};

  if (name.length < 2) errors.name = "Enter your full name.";
  if (university.length < 2) errors.university = "Enter your university.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (!DIVISIONS.has(division)) errors.division = "Select Law, Finance or Markets.";
  if (consent !== "on" && consent !== "true") {
    errors.privacyConsent = "You must acknowledge the privacy notice.";
  }
  if (!(cv instanceof File)) errors.cv = "Attach your CV as a PDF.";
  if (Object.keys(errors).length) {
    return Response.json({ error: "Check the highlighted fields.", fields: errors }, { status: 422 });
  }

  const existing = await database()
    .prepare("SELECT 1 AS present FROM applicants WHERE submission_key = ? LIMIT 1")
    .bind(submissionKey)
    .first<{ present: number }>();
  if (existing) return Response.json({ ok: true }, { status: 200 });

  const inspected = await inspectPdf(cv as File, MAX_CV_BYTES);
  if (!inspected.ok) {
    return Response.json({ error: inspected.error, fields: { cv: inspected.error } }, { status: 422 });
  }

  const id = createId("application");
  const safeFilename =
    (cv as File).name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) ||
    "applicant-cv.pdf";
  const cvKey = `private/applicants/${id}/${crypto.randomUUID()}-${safeFilename}`;
  if (!isApplicantCvKey(id, cvKey)) {
    return Response.json(
      { error: "The CV could not be stored safely." },
      { status: 500 },
    );
  }

  const beforeStaging = await applicationIntakeGate(settings);
  if (!beforeStaging.ok) return beforeStaging.response;
  await privateFiles().put(cvKey, inspected.bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { applicationId: id, scanStatus: "quarantined" },
  });

  const beforePersistence = await applicationIntakeGate(settings);
  if (!beforePersistence.ok) {
    await privateFiles().delete(cvKey);
    return beforePersistence.response;
  }

  const now = Date.now();
  const retentionExpiresAt = applicantRetentionDeadline(
    now,
    settings.retention_days,
  );
  const contact = await getPublishedSiteContact();
  const emailJobs: EmailJob[] = [
    {
      template: "applicant-confirmation",
      to: [email],
      data: {
        name,
        division,
        applicationId: id,
        contactEmail: contact.email,
      },
    },
    ...(recipients.length
      ? [
          {
            template: "new-application-admin" as const,
            to: recipients,
            data: {
              name,
              university,
              division,
              applicationId: id,
              applicationPath: `/admin/applicants/${id}`,
              submittedAt: new Date(now).toISOString(),
            },
          },
        ]
      : []),
  ];
  try {
    const db = database();
    const settingsGuard = `FROM application_settings
      WHERE id = 1 AND open = 1 AND notification_recipients = ?
        AND privacy_policy_version = ? AND retention_days = ?`;
    const guardBindings = [
      settings.notification_recipients,
      settings.privacy_policy_version,
      settings.retention_days,
    ] as const;
    const statements: D1PreparedStatement[] = [
      database()
        .prepare(
          `INSERT INTO applicants
           (id, submission_key, name, university, email, division, cv_key, cv_filename,
            cv_size, status, privacy_acknowledged_at, privacy_policy_version, source,
            campaign, submitted_at, retention_expires_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?
           ${settingsGuard}`,
        )
        .bind(
          id,
          submissionKey,
          name,
          university,
          email,
          division,
          cvKey,
          safeFilename,
          (cv as File).size,
          now,
          settings.privacy_policy_version,
          cleanPlainText(form.get("source"), 100) || null,
          cleanPlainText(form.get("campaign"), 100) || null,
          now,
          retentionExpiresAt,
          now,
          ...guardBindings,
        ),
      database()
        .prepare(
          `INSERT INTO applicant_status_history
           (id, applicant_id, from_status, to_status, changed_by, changed_at)
           SELECT ?, ?, NULL, 'new', NULL, ?
           ${settingsGuard}`,
        )
        .bind(createId("history"), id, now, ...guardBindings),
      database()
        .prepare(
          `INSERT INTO background_jobs
           (id, type, status, payload, attempts, run_after, created_at, updated_at)
           SELECT ?, 'file_scan', 'queued', ?, 0, ?, ?, ?
           ${settingsGuard}`,
        )
        .bind(
          createId("job"),
          JSON.stringify({ applicationId: id, key: cvKey }),
          now,
          now,
          now,
          ...guardBindings,
        ),
    ];
    for (const emailJob of emailJobs) {
      statements.push(
        db
          .prepare(
            `INSERT INTO background_jobs
             (id, type, status, payload, attempts, run_after, created_at, updated_at)
             SELECT ?, 'email', 'queued', ?, 0, ?, ?, ?
             ${settingsGuard}`,
          )
          .bind(
            createId("job"),
            JSON.stringify(emailJob),
            now,
            now,
            now,
            ...guardBindings,
        ),
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO audit_log
           (id, actor_id, action, entity_type, entity_id, metadata, created_at)
           SELECT ?, NULL, 'application.submitted', 'applicant', ?, ?, ?
           FROM applicants
           WHERE id = ? AND EXISTS (
             SELECT 1 FROM application_settings
             WHERE id = 1 AND open = 1 AND notification_recipients = ?
               AND privacy_policy_version = ? AND retention_days = ?
           )`,
        )
        .bind(
          createId("audit"),
          id,
          JSON.stringify({ division, duplicateEmailCheck: true }),
          now,
          id,
          ...guardBindings,
        ),
    );
    const results = await db.batch(statements);
    if (
      (results[0]?.meta.changes ?? 0) !== 1 ||
      (results.at(-1)?.meta.changes ?? 0) !== 1
    ) {
      await privateFiles().delete(cvKey);
      const closedOrChanged = await applicationIntakeGate(settings);
      return closedOrChanged.ok
        ? temporarilyUnavailableResponse()
        : closedOrChanged.response;
    }
  } catch (error) {
    await privateFiles().delete(cvKey);
    if (
      String(error).includes("idx_applicants_submission_key") ||
      String(error).includes("applicants.submission_key")
    ) {
      return Response.json({ ok: true }, { status: 200 });
    }
    throw error;
  }

  return Response.json({ ok: true }, { status: 201 });
}

async function applicationIntakeGate(
  expected?: ReadyApplicationSettingsSnapshot,
): Promise<ApplicationIntakeGate> {
  const settings = await database()
    .prepare(
      `SELECT open, notification_recipients, privacy_policy_version, retention_days
       FROM application_settings WHERE id = 1`,
    )
    .first<ApplicationSettingsSnapshot>();

  // Evaluate closure first so closing intake always wins over simultaneous
  // readiness or policy edits.
  if (!settings?.open) {
    return {
      ok: false,
      response: Response.json(
        { error: "Applications are currently closed." },
        { status: 409 },
      ),
    };
  }

  const recipients = safeJson<string[]>(settings.notification_recipients, []);
  const readiness = await currentRecruitmentIntakeReadiness({
    retentionDays: settings.retention_days,
    privacyPolicyVersion: settings.privacy_policy_version,
    notificationRecipients: recipients,
  });
  if (
    !readiness.ready ||
    settings.retention_days === null ||
    (expected !== undefined &&
      (settings.notification_recipients !== expected.notification_recipients ||
        settings.privacy_policy_version !== expected.privacy_policy_version ||
        settings.retention_days !== expected.retention_days))
  ) {
    return { ok: false, response: temporarilyUnavailableResponse() };
  }

  return {
    ok: true,
    settings: settings as ReadyApplicationSettingsSnapshot,
    recipients,
  };
}

function temporarilyUnavailableResponse(): Response {
  return Response.json(
    { error: "Applications are temporarily unavailable." },
    { status: 503, headers: { "Retry-After": "3600" } },
  );
}
