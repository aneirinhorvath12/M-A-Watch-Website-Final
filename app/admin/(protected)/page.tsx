import Link from "next/link";
import { PageHeader, Panel, StatCard, StatusBadge, adminStyles as styles } from "@/components/admin/AdminUI";
import { requireAdmin } from "@/lib/admin-auth";
import { database, safeJson } from "@/lib/platform";
import { formatAdminDate, titleCaseStatus } from "@/lib/admin-data";
import { currentRecruitmentReadiness } from "@/lib/recruitment-runtime";
import { LEGACY_SOURCE_WORKFLOW_MESSAGES } from "@/lib/publication-warnings";

export const dynamic = "force-dynamic";

type CountRow = { count: number };
type PublicationRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  updated_at: number;
};
type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  created_at: number;
  actor_name: string | null;
};
type JobRow = { id: string; type: string; status: string; attempts: number; error: string | null; updated_at: number };

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const actor = await requireAdmin("/admin");
  const params = await searchParams;
  const [review, attention, newApplicants, scheduled, applicationSettings, publications, activity, statusCounts, jobs] = await Promise.all([
    database().prepare("SELECT COUNT(*) AS count FROM publications WHERE status = 'review'").first<CountRow>(),
    database().prepare(
      `SELECT COUNT(*) AS count FROM publications
       WHERE status = 'parse_failed'
          OR EXISTS (
            SELECT 1 FROM json_each(publications.parse_warnings) warning
            WHERE warning.value NOT IN (?, ?)
          )`,
    ).bind(...LEGACY_SOURCE_WORKFLOW_MESSAGES).first<CountRow>(),
    database().prepare("SELECT COUNT(*) AS count FROM applicants WHERE status = 'new' AND deletion_requested_at IS NULL").first<CountRow>(),
    database().prepare("SELECT COUNT(*) AS count FROM publications WHERE status = 'scheduled'").first<CountRow>(),
    database().prepare("SELECT open, notification_recipients, privacy_policy_version, retention_days FROM application_settings WHERE id = 1").first<{ open: number; notification_recipients: string; privacy_policy_version: string; retention_days: number | null }>(),
    database().prepare(
      `SELECT id, title, type, status, updated_at FROM publications
       WHERE status IN ('review', 'scheduled', 'parse_failed', 'published')
       ORDER BY updated_at DESC LIMIT 8`,
    ).all<PublicationRow>(),
    database().prepare(
      `SELECT audit.id, audit.action, audit.entity_type, audit.created_at, users.name AS actor_name
       FROM audit_log audit LEFT JOIN admin_users users ON users.id = audit.actor_id
       WHERE audit.actor_id = ? OR audit.entity_type IN ('publication', 'applicant', 'application_settings')
       ORDER BY audit.created_at DESC LIMIT 8`,
    ).bind(actor.id).all<AuditRow>(),
    database().prepare("SELECT status, COUNT(*) AS count FROM applicants WHERE deletion_requested_at IS NULL GROUP BY status ORDER BY status").all<{ status: string; count: number }>(),
    database().prepare(
      `SELECT id, type, status, attempts, error, updated_at FROM background_jobs
       WHERE type IN ('email', 'file_scan', 'publication_parse', 'applicant_delete')
       ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'running' THEN 1 WHEN 'queued' THEN 2 ELSE 3 END,
                updated_at DESC LIMIT 8`,
    ).all<JobRow>(),
  ]);
  const recruitmentReadiness = currentRecruitmentReadiness({
    retentionDays: applicationSettings?.retention_days ?? null,
    privacyPolicyVersion: applicationSettings?.privacy_policy_version ?? "",
    notificationRecipients: safeJson<string[]>(
      applicationSettings?.notification_recipients,
      [],
    ),
  });
  const applicationsOpen = Boolean(applicationSettings?.open) && recruitmentReadiness.ready;

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title={`Welcome back, ${actor.name.split(/\s+/)[0] || "editor"}`}
        description="A concise view of publishing, recruitment and the administrative actions that need attention."
        actions={<Link className={styles.button} href="/admin/publications/new">New publication</Link>}
      />
      {params.notice === "permission-denied" ? (
        <div className={styles.noticeError} role="alert">Your account does not have permission to manage administrative users.</div>
      ) : null}
      <section className={styles.stats} aria-label="Current workload">
        <StatCard label="Awaiting review" value={review?.count ?? 0} note="Publication drafts" />
        <StatCard label="Needs attention" value={attention?.count ?? 0} note="Parser failures or warnings" />
        <StatCard label="New applicants" value={newApplicants?.count ?? 0} note="Not yet reviewed" />
        <StatCard label="Scheduled" value={scheduled?.count ?? 0} note="Upcoming publications" />
      </section>

      <div className={styles.gridTwo}>
        <Panel title="Publishing queue" meta={<Link className={styles.buttonQuiet} href="/admin/publications">View all</Link>}>
          {publications.results.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Publication</th><th>Type</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody>
                  {publications.results.map((item) => (
                    <tr key={item.id}>
                      <td><Link className={styles.primaryCell} href={`/admin/publications/${item.id}`}>{item.title}</Link></td>
                      <td>{titleCaseStatus(item.type)}</td>
                      <td><StatusBadge value={titleCaseStatus(item.status)} /></td>
                      <td>{formatAdminDate(item.updated_at, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className={styles.empty}><h2 className={styles.emptyTitle}>Nothing is waiting</h2><p className={styles.emptyText}>New publication drafts and scheduled items will appear here.</p></div>}
        </Panel>

        <div>
          <Panel title="Applications" meta={<StatusBadge value={applicationsOpen ? "Open" : applicationSettings?.open ? "Blocked" : "Closed"} />}>
            <div className={styles.panelBody}>
              {statusCounts.results.length ? (
                <dl className={styles.detailList}>
                  {statusCounts.results.map((item) => (
                    <div className={styles.detailItem} key={item.status}>
                      <dt>{titleCaseStatus(item.status)}</dt><dd>{item.count}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className={styles.emptyText}>No applications have been submitted yet.</p>}
              <div className={styles.buttonRow} style={{ marginTop: "1rem" }}>
                <Link className={styles.buttonSecondary} href="/admin/applicants">Applicant list</Link>
                <Link className={styles.buttonQuiet} href="/admin/application-settings">Settings</Link>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Recent administrative activity" meta={<Link className={styles.buttonQuiet} href="/admin/audit-log">Full audit history</Link>}>
        {activity.results.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Action</th><th>Area</th><th>Actor</th><th>Time</th></tr></thead>
              <tbody>
                {activity.results.map((item) => (
                  <tr key={item.id}>
                    <td>{titleCaseStatus(item.action.replace(/\./g, " "))}</td>
                    <td>{titleCaseStatus(item.entity_type)}</td>
                    <td>{item.actor_name ?? "System / public"}</td>
                    <td>{formatAdminDate(item.created_at, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className={styles.empty}><h2 className={styles.emptyTitle}>No activity yet</h2><p className={styles.emptyText}>Important changes will be recorded here automatically.</p></div>}
      </Panel>

      <Panel title="Background work" meta="Email, scanning, parser and deletion">
        {jobs.results.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Work</th><th>Status</th><th>Attempts</th><th>Last update</th><th>Detail</th></tr></thead>
              <tbody>{jobs.results.map((job) => <tr key={job.id}><td>{titleCaseStatus(job.type)}</td><td><StatusBadge value={titleCaseStatus(job.status)} /></td><td>{job.attempts}</td><td>{formatAdminDate(job.updated_at, true)}</td><td>{job.error ?? (job.status === "queued" ? "Queued; may be awaiting provider setup." : "—")}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <div className={styles.empty}><h2 className={styles.emptyTitle}>The queue is empty</h2><p className={styles.emptyText}>External delivery, scanning, parser work and applicant deletion will appear here. Provider-backed jobs wait safely until their integration is configured.</p></div>}
      </Panel>
    </>
  );
}
