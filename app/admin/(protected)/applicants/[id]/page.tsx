import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { PageHeader, Panel, StatusBadge, adminStyles as styles } from "@/components/admin/AdminUI";
import { requireAdmin } from "@/lib/admin-auth";
import { APPLICANT_STATUSES, formatAdminDate, getApplicantAdmin, titleCaseStatus } from "@/lib/admin-data";
import { writeAudit } from "@/lib/audit";
import { database, privateFiles } from "@/lib/platform";

export const dynamic = "force-dynamic";

type NoteRow = { id: string; body: string; created_at: number; actor_name: string | null; actor_status: string | null };
type HistoryRow = { id: string; from_status: string | null; to_status: string; changed_at: number; actor_name: string | null; actor_status: string | null };

function fileSize(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function ApplicantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin("/admin/applicants");
  const { id } = await params;
  const applicant = await getApplicantAdmin(id);
  if (!applicant) notFound();
  const cvRow = await database().prepare("SELECT cv_key FROM applicants WHERE id = ?").bind(id).first<{ cv_key: string }>();
  const [notes, history, cvObject, scanJob] = await Promise.all([
    database().prepare(
      `SELECT notes.id, notes.body, notes.created_at, users.name AS actor_name, users.status AS actor_status
       FROM applicant_notes notes LEFT JOIN admin_users users ON users.id = notes.created_by
       WHERE notes.applicant_id = ? ORDER BY notes.created_at DESC`,
    ).bind(id).all<NoteRow>(),
    database().prepare(
      `SELECT history.id, history.from_status, history.to_status, history.changed_at,
              users.name AS actor_name, users.status AS actor_status
       FROM applicant_status_history history LEFT JOIN admin_users users ON users.id = history.changed_by
       WHERE history.applicant_id = ? ORDER BY history.changed_at DESC`,
    ).bind(id).all<HistoryRow>(),
    cvRow?.cv_key ? privateFiles().head(cvRow.cv_key) : Promise.resolve(null),
    database().prepare(
      `SELECT status, error FROM background_jobs
       WHERE type = 'file_scan' AND json_extract(payload, '$.applicationId') = ?
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(id).first<{ status: string; error: string | null }>(),
  ]);
  const scanStatus = !cvObject
    ? "missing"
    : scanJob?.status === "succeeded" && cvObject.customMetadata?.scanStatus === "clean"
      ? "succeeded"
      : scanJob?.status === "failed" || cvObject.customMetadata?.scanStatus === "rejected"
        ? "failed"
        : scanJob?.status ?? "queued";
  await writeAudit({ actorId: actor.id, action: "applicant.record_viewed", entityType: "applicant", entityId: id });

  return (
    <>
      <PageHeader
        eyebrow={`${titleCaseStatus(applicant.division)} application`}
        title={applicant.name}
        description={`Submitted ${formatAdminDate(applicant.submitted_at, true)}. Applicant status changes never trigger an email automatically.`}
        actions={<><StatusBadge value={titleCaseStatus(applicant.status)} /><Link className={styles.buttonSecondary} href="/admin/applicants">Back to list</Link></>}
      />
      {applicant.duplicate_count > 1 ? <div className={styles.noticeWarning}><strong>Possible duplicate:</strong> {applicant.duplicate_count} applications use this email address. Review them individually; no automatic decision has been made.</div> : null}
      <div className={styles.gridTwo}>
        <div>
          <Panel title="Application record" meta={`Policy ${applicant.privacy_policy_version}`}>
            <div className={styles.panelBody}>
              <dl className={styles.detailList}>
                <div className={styles.detailItem}><dt>Email</dt><dd><a href={`mailto:${applicant.email}`}>{applicant.email}</a></dd></div>
                <div className={styles.detailItem}><dt>University</dt><dd>{applicant.university}</dd></div>
                <div className={styles.detailItem}><dt>Division</dt><dd>{titleCaseStatus(applicant.division)}</dd></div>
                <div className={styles.detailItem}><dt>Submitted</dt><dd>{formatAdminDate(applicant.submitted_at, true)}</dd></div>
                <div className={styles.detailItem}><dt>Privacy acknowledged</dt><dd>{formatAdminDate(applicant.privacy_acknowledged_at, true)}</dd></div>
                <div className={styles.detailItem}><dt>Attribution</dt><dd>{[applicant.source, applicant.campaign].filter(Boolean).join(" · ") || "Direct / not supplied"}</dd></div>
              </dl>
            </div>
          </Panel>

          <Panel title="Internal notes" meta={`${notes.results.length} note${notes.results.length === 1 ? "" : "s"}`}>
            <div className={styles.panelBody}>
              <ActionForm action={`/api/admin/applicants/${id}/notes`} submitLabel="Add internal note">
                <label className={styles.label} htmlFor="note-body">New note</label>
                <textarea className={styles.textarea} id="note-body" name="body" maxLength={4000} required />
                <span className={styles.hint}>Notes are visible only to administrative users and are included in the audit trail.</span>
              </ActionForm>
              <div className={styles.divider} />
              {notes.results.length ? <ul className={styles.timeline}>{notes.results.map((note) => <li className={styles.timelineItem} key={note.id}><div className={styles.timelineTitle}>{note.actor_name ?? "Former or system user"}{note.actor_status === "disabled" ? " (disabled)" : ""}</div><div className={styles.timelineMeta}>{formatAdminDate(note.created_at, true)}</div><p className={styles.noteBody}>{note.body}</p></li>)}</ul> : <p className={styles.emptyText}>No internal notes have been added.</p>}
            </div>
          </Panel>
        </div>

        <div>
          <Panel title="Review status" meta="No email is sent">
            <div className={styles.panelBody}>
              <ActionForm action={`/api/admin/applicants/${id}/status`} method="PATCH" submitLabel="Update status" confirmation="Record this applicant status change? No email will be sent.">
                <label className={styles.label} htmlFor="status">Applicant status</label>
                <select className={styles.select} id="status" name="status" defaultValue={applicant.status}>
                  {APPLICANT_STATUSES.map((status) => <option key={status} value={status}>{titleCaseStatus(status)}</option>)}
                </select>
              </ActionForm>
            </div>
          </Panel>

          <Panel title="Private CV" meta={`${fileSize(applicant.cv_size)} · PDF`}>
            <div className={styles.panelBody}>
              <p className={styles.noteBody}>{applicant.cv_filename}</p>
              <p className={styles.hint}>Security scan: <strong>{titleCaseStatus(scanStatus)}</strong>. Downloads are authenticated, private, non-cacheable and audited.</p>
              {scanStatus === "succeeded" ? <a className={styles.buttonSecondary} href={`/api/files/applicants/${id}/cv`}>Download CV</a> : <button className={styles.buttonSecondary} type="button" disabled>{scanStatus === "failed" ? "CV scan failed" : "CV quarantined"}</button>}
              {scanJob?.error ? <p className={styles.noteBody}>Scan error: {scanJob.error}</p> : null}
            </div>
          </Panel>

          <Panel title="Status history" meta={`${history.results.length} event${history.results.length === 1 ? "" : "s"}`}>
            <div className={styles.panelBody}>
              {history.results.length ? <ul className={styles.timeline}>{history.results.map((entry) => <li className={styles.timelineItem} key={entry.id}><div className={styles.timelineTitle}>{entry.from_status ? `${titleCaseStatus(entry.from_status)} → ` : ""}{titleCaseStatus(entry.to_status)}</div><div className={styles.timelineMeta}>{formatAdminDate(entry.changed_at, true)} · {entry.actor_name ?? "Initial submission"}{entry.actor_status === "disabled" ? " (disabled)" : ""}</div></li>)}</ul> : <p className={styles.emptyText}>No status history is available.</p>}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
