import Link from "next/link";
import { EmptyState, PageHeader, adminStyles as styles } from "@/components/admin/AdminUI";
import { d1LikePattern } from "@/lib/d1-query";
import { requireAdmin } from "@/lib/admin-auth";
import { formatAdminDate, titleCaseStatus } from "@/lib/admin-data";
import { database } from "@/lib/platform";

export const dynamic = "force-dynamic";

type AuditRow = { id: string; action: string; entity_type: string; entity_id: string | null; metadata: string; created_at: number; actor_name: string | null; actor_email: string | null; actor_status: string | null };

function one(value: string | string[] | undefined): string { return (Array.isArray(value) ? value[0] : value)?.slice(0, 160) ?? ""; }

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const signedIn = await requireAdmin("/admin/audit-log");
  const params = await searchParams;
  const q = one(params.q).trim();
  const entity = one(params.entity);
  const actor = one(params.actor).trim();
  const conditions: string[] = [];
  const bindings: string[] = [];
  if (signedIn.role !== "super_user") conditions.push("audit.entity_type != 'admin_user'");
  if (q) { conditions.push("(audit.action LIKE ? ESCAPE '\\' OR audit.entity_id LIKE ? ESCAPE '\\')"); const like = d1LikePattern(q); bindings.push(like, like); }
  if (entity) { conditions.push("audit.entity_type = ?"); bindings.push(entity); }
  if (actor) { conditions.push("(users.name LIKE ? ESCAPE '\\' OR users.email LIKE ? ESCAPE '\\')"); const like = d1LikePattern(actor); bindings.push(like, like); }
  const statement = database().prepare(
    `SELECT audit.id, audit.action, audit.entity_type, audit.entity_id, audit.metadata, audit.created_at,
            users.name AS actor_name, users.email AS actor_email, users.status AS actor_status
     FROM audit_log audit LEFT JOIN admin_users users ON users.id = audit.actor_id
     ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY audit.created_at DESC LIMIT 250`,
  );
  const result = bindings.length ? await statement.bind(...bindings).all<AuditRow>() : await statement.all<AuditRow>();
  return (
    <>
      <PageHeader eyebrow="Governance" title="Audit history" description="An immutable administrative record of security, publishing, recruitment, account and public-content actions. Audit records cannot be edited here." />
      <form className={styles.filters} method="get" aria-label="Filter audit history">
        <div className={styles.fieldHalf}><label className={styles.label} htmlFor="audit-q">Action or record ID</label><input className={styles.input} id="audit-q" name="q" defaultValue={q} /></div>
        <div className={styles.fieldQuarter}><label className={styles.label} htmlFor="audit-entity">Area</label><select className={styles.select} id="audit-entity" name="entity" defaultValue={entity}><option value="">All areas</option>{signedIn.role === "super_user" ? <option value="admin_user">Accounts</option> : null}<option value="publication">Publications</option><option value="applicant">Applicants</option><option value="application_settings">Application settings</option><option value="team_member">Team</option><option value="content_entry">Content</option></select></div>
        <div className={styles.fieldQuarter}><label className={styles.label} htmlFor="audit-actor">Actor</label><input className={styles.input} id="audit-actor" name="actor" defaultValue={actor} /></div>
        <div className={`${styles.fieldWide} ${styles.inlineActions}`}><button className={styles.buttonSecondary} type="submit">Apply filters</button><Link className={styles.buttonQuiet} href="/admin/audit-log">Clear</Link></div>
      </form>
      <section className={styles.panel}>
        {result.results.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Time</th><th>Action</th><th>Affected record</th><th>Actor</th><th>Context</th></tr></thead><tbody>{result.results.map((entry) => <tr key={entry.id}><td>{formatAdminDate(entry.created_at, true)}</td><td>{titleCaseStatus(entry.action.replace(/\./g, " "))}</td><td>{titleCaseStatus(entry.entity_type)}{entry.entity_id ? <span className={styles.secondaryCell}>{entry.entity_id}</span> : null}</td><td>{entry.actor_name ?? "System / public"}<span className={styles.secondaryCell}>{entry.actor_email ?? "No administrative account"}{entry.actor_status === "disabled" ? " · disabled" : ""}</span></td><td><details><summary>View</summary><pre className={styles.codeValue}>{(() => { try { return JSON.stringify(JSON.parse(entry.metadata), null, 2); } catch { return "{}"; } })()}</pre></details></td></tr>)}</tbody></table></div> : <EmptyState title="No audit events match">Clear the filters or perform an administrative action to create the first matching record.</EmptyState>}
      </section>
      {result.results.length === 250 ? <div className={styles.notice}>Showing the 250 most recent matching events. Refine the filters to inspect a narrower period or area.</div> : null}
    </>
  );
}
