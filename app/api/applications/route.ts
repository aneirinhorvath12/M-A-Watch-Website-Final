import { ensureDatabase } from "@/db/bootstrap";
import { writeAudit } from "@/lib/audit";
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
  rateLimit,
} from "@/lib/security";

const DIVISIONS = new Set(["law", "finance", "markets"]);

export async function POST(request: Request) {
  if (!hasSafeRequestOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  if (!(await rateLimit(request, "application-submit", 6, 15 * 60 * 1000))) {
    return Response.json(
      { error: "Too many attempts. Please wait before trying again." },
      { status: 429 },
    );
  }

  await ensureDatabase();
  const settings = await database()
    .prepare(
      `SELECT open, notification_recipients, privacy_policy_version
       FROM application_settings WHERE id = 1`,
    )
    .first<{
      open: number;
      notification_recipients: string;
      privacy_policy_version: string;
    }>();
  if (!settings?.open) {
    return Response.json({ error: "Applications are currently closed." }, { status: 409 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "The submitted form could not be read." }, { status: 400 });
  }

  if (cleanPlainText(form.get("website"), 200)) {
    return Response.json({ ok: true, applicationId: "received" }, { status: 201 });
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
    .prepare("SELECT id FROM applicants WHERE submission_key = ? LIMIT 1")
    .bind(submissionKey)
    .first<{ id: string }>();
  if (existing) return Response.json({ ok: true, applicationId: existing.id }, { status: 200 });

  const inspected = await inspectPdf(cv as File, MAX_CV_BYTES);
  if (!inspected.ok) {
    return Response.json({ error: inspected.error, fields: { cv: inspected.error } }, { status: 422 });
  }

  const id = createId("application");
  const safeFilename = (cv as File).name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const cvKey = `private/applicants/${id}/${crypto.randomUUID()}-${safeFilename}`;
  await privateFiles().put(cvKey, inspected.bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { applicationId: id, scanStatus: "quarantined" },
  });

  const now = Date.now();
  const recipients = safeJson<string[]>(settings.notification_recipients, []);
  const emailJobs: EmailJob[] = [
    {
      template: "applicant-confirmation",
      to: [email],
      data: {
        name,
        division,
        applicationId: id,
        contactEmail: "hello@mawatch.org",
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
    const statements: D1PreparedStatement[] = [
      database()
        .prepare(
          `INSERT INTO applicants
           (id, submission_key, name, university, email, division, cv_key, cv_filename,
            cv_size, status, privacy_acknowledged_at, privacy_policy_version, source,
            campaign, submitted_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?)`,
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
          now,
        ),
      database()
        .prepare(
          `INSERT INTO applicant_status_history
           (id, applicant_id, from_status, to_status, changed_by, changed_at)
           VALUES (?, ?, NULL, 'new', NULL, ?)`,
        )
        .bind(createId("history"), id, now),
      database()
        .prepare(
          `INSERT INTO background_jobs
           (id, type, status, payload, attempts, run_after, created_at, updated_at)
           VALUES (?, 'file_scan', 'queued', ?, 0, ?, ?, ?)`,
        )
        .bind(createId("job"), JSON.stringify({ applicationId: id, key: cvKey }), now, now, now),
    ];
    for (const emailJob of emailJobs) {
      statements.push(
        db
          .prepare(
            `INSERT INTO background_jobs
             (id, type, status, payload, attempts, run_after, created_at, updated_at)
             VALUES (?, 'email', 'queued', ?, 0, ?, ?, ?)`,
          )
          .bind(
            createId("job"),
            JSON.stringify(emailJob),
            now,
            now,
            now,
          ),
      );
    }
    await db.batch(statements);
  } catch (error) {
    await privateFiles().delete(cvKey);
    if (
      String(error).includes("idx_applicants_submission_key") ||
      String(error).includes("applicants.submission_key")
    ) {
      const duplicate = await database()
        .prepare("SELECT id FROM applicants WHERE submission_key = ? LIMIT 1")
        .bind(submissionKey)
        .first<{ id: string }>();
      return Response.json({ ok: true, applicationId: duplicate?.id ?? id }, { status: 200 });
    }
    throw error;
  }

  await writeAudit({
    action: "application.submitted",
    entityType: "applicant",
    entityId: id,
    metadata: { division, duplicateEmailCheck: true },
  });

  return Response.json({ ok: true, applicationId: id }, { status: 201 });
}
