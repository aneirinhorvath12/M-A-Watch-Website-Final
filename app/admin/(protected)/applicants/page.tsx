import Link from "next/link";
import { EmptyState, PageHeader, StatusBadge, adminStyles as styles } from "@/components/admin/AdminUI";
import { APPLICANT_STATUSES, formatAdminDate, listApplicants, titleCaseStatus } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.slice(0, 160) ?? "";
}

export default async function ApplicantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = {
    q: one(params.q), status: one(params.status), division: one(params.division),
    from: one(params.from), to: one(params.to), sort: one(params.sort) || "newest", limit: 100,
  };
  const applicants = await listApplicants(filters);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (typeof value === "string" && value) query.set(key, value);

  return (
    <>
      <PageHeader
        eyebrow="Recruitment"
        title="Applicants"
        description="Review applications, record internal decisions and export only the current filtered data. Status changes do not send emails in this release."
        actions={<a className={styles.buttonSecondary} href={`/api/admin/applicants/export?${query.toString()}`}>Export filtered CSV</a>}
      />
      <form className={styles.filters} method="get" aria-label="Filter applicants">
        <div className={styles.fieldHalf}><label className={styles.label} htmlFor="applicant-search">Search</label><input className={styles.input} id="applicant-search" name="q" defaultValue={filters.q} placeholder="Name, university or email" /></div>
        <div className={styles.fieldQuarter}><label className={styles.label} htmlFor="applicant-status">Status</label><select className={styles.select} id="applicant-status" name="status" defaultValue={filters.status}><option value="">All statuses</option>{APPLICANT_STATUSES.map((item) => <option key={item} value={item}>{titleCaseStatus(item)}</option>)}</select></div>
        <div className={styles.fieldQuarter}><label className={styles.label} htmlFor="applicant-division">Division</label><select className={styles.select} id="applicant-division" name="division" defaultValue={filters.division}><option value="">All divisions</option><option value="law">Law</option><option value="finance">Finance</option><option value="markets">Markets</option></select></div>
        <div className={styles.fieldQuarter}><label className={styles.label} htmlFor="from">From</label><input className={styles.input} id="from" name="from" type="date" defaultValue={filters.from} /></div>
        <div className={styles.fieldQuarter}><label className={styles.label} htmlFor="to">To</label><input className={styles.input} id="to" name="to" type="date" defaultValue={filters.to} /></div>
        <div className={styles.fieldQuarter}><label className={styles.label} htmlFor="sort">Sort</label><select className={styles.select} id="sort" name="sort" defaultValue={filters.sort}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name</option><option value="university">University</option><option value="status">Status</option></select></div>
        <div className={`${styles.fieldQuarter} ${styles.inlineActions}`}><button className={styles.buttonSecondary} type="submit">Apply filters</button><Link className={styles.buttonQuiet} href="/admin/applicants">Clear</Link></div>
      </form>

      <section className={styles.panel} aria-label="Applicant records">
        {applicants.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Applicant</th><th>University</th><th>Division</th><th>Status</th><th>Submitted</th><th>Duplicate check</th></tr></thead>
              <tbody>
                {applicants.map((item) => (
                  <tr key={item.id}>
                    <td><Link className={styles.primaryCell} href={`/admin/applicants/${item.id}`}>{item.name}</Link><span className={styles.secondaryCell}>{item.email}</span></td>
                    <td>{item.university}</td>
                    <td>{titleCaseStatus(item.division)}</td>
                    <td><StatusBadge value={titleCaseStatus(item.status)} /></td>
                    <td>{formatAdminDate(item.submitted_at, true)}</td>
                    <td>{item.duplicate_count > 1 ? <StatusBadge value="Possible duplicate" /> : "No match"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No applicants match">No applicant records match the current filters. Clear the filters or wait for a new submission.</EmptyState>}
      </section>
      {applicants.length === 100 ? <div className={styles.notice}>Showing the first 100 matching records. Narrow the filters before exporting a larger working set.</div> : null}
    </>
  );
}
