import Link from "next/link";
import { EmptyState, PageHeader, StatusBadge, adminStyles as styles } from "@/components/admin/AdminUI";
import { d1LikePattern } from "@/lib/d1-query";
import { PUBLICATION_STATUSES, formatAdminDate, titleCaseStatus, type PublicationStatus } from "@/lib/admin-data";
import { database } from "@/lib/platform";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  type: string;
  status: string;
  publication_date: number;
  updated_at: number;
  parse_warnings: string;
  parse_error: string | null;
};

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.slice(0, 160) ?? "";
}

export default async function PublicationsAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = one(params.q).trim();
  const type = one(params.type);
  const status = one(params.status);
  const conditions: string[] = [];
  const bindings: string[] = [];
  if (["strategic", "legal", "markets"].includes(type)) { conditions.push("type = ?"); bindings.push(type); }
  if (PUBLICATION_STATUSES.includes(status as PublicationStatus)) { conditions.push("status = ?"); bindings.push(status); }
  if (q) {
    conditions.push("(title LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\')");
    const like = d1LikePattern(q);
    bindings.push(like, like, like);
  }
  const statement = database().prepare(
    `SELECT id, title, type, status, publication_date, updated_at, parse_warnings, parse_error
     FROM publications ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY updated_at DESC LIMIT 200`,
  );
  const result = bindings.length ? await statement.bind(...bindings).all<Row>() : await statement.all<Row>();

  return (
    <>
      <PageHeader
        eyebrow="Publishing"
        title="Publications"
        description="Search every draft, review source warnings and control what becomes public. Only the Published status is visible on the public website."
        actions={<Link className={styles.button} href="/admin/publications/new">New publication</Link>}
      />
      <form className={styles.filters} method="get" aria-label="Filter publications">
        <div className={styles.fieldHalf}>
          <label className={styles.label} htmlFor="publication-search">Search</label>
          <input className={styles.input} id="publication-search" name="q" defaultValue={q} placeholder="Title, summary or slug" />
        </div>
        <div className={styles.fieldQuarter}>
          <label className={styles.label} htmlFor="publication-type">Type</label>
          <select className={styles.select} id="publication-type" name="type" defaultValue={type}>
            <option value="">All types</option><option value="strategic">Strategic</option><option value="legal">Legal</option><option value="markets">Markets</option>
          </select>
        </div>
        <div className={styles.fieldQuarter}>
          <label className={styles.label} htmlFor="publication-status">Status</label>
          <select className={styles.select} id="publication-status" name="status" defaultValue={status}>
            <option value="">All statuses</option>
            {PUBLICATION_STATUSES.map((item) => <option key={item} value={item}>{titleCaseStatus(item)}</option>)}
          </select>
        </div>
        <div className={`${styles.fieldWide} ${styles.inlineActions}`}>
          <button className={styles.buttonSecondary} type="submit">Apply filters</button>
          <Link className={styles.buttonQuiet} href="/admin/publications">Clear</Link>
        </div>
      </form>

      <section className={styles.panel} aria-label="Publication records">
        {result.results.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Publication</th><th>Type</th><th>Status</th><th>Publication date</th><th>Updated</th><th>Attention</th></tr></thead>
              <tbody>
                {result.results.map((item) => {
                  const warningCount = (() => { try { const value: unknown = JSON.parse(item.parse_warnings); return Array.isArray(value) ? value.length : 0; } catch { return 0; } })();
                  return (
                    <tr key={item.id}>
                      <td><Link className={styles.primaryCell} href={`/admin/publications/${item.id}`}>{item.title}</Link></td>
                      <td>{titleCaseStatus(item.type)}</td>
                      <td><StatusBadge value={titleCaseStatus(item.status)} /></td>
                      <td>{formatAdminDate(item.publication_date)}</td>
                      <td>{formatAdminDate(item.updated_at, true)}</td>
                      <td>{item.parse_error ? <StatusBadge value="Parse failed" /> : warningCount ? `${warningCount} warning${warningCount === 1 ? "" : "s"}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={q || type || status ? "No publications match" : "No publications yet"}>
            {q || type || status ? <>Change or clear the current filters.</> : <>Create the first Strategic, Legal or Markets publication to begin the editorial workflow.</>}
          </EmptyState>
        )}
      </section>
    </>
  );
}
