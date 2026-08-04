import { env } from "cloudflare:workers";
import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
  adminStyles as styles,
} from "@/components/admin/AdminUI";
import { requireAdmin } from "@/lib/admin-auth";
import { titleCaseStatus } from "@/lib/admin-data";
import { analyticsEnabled } from "@/lib/analytics-policy";
import { database } from "@/lib/platform";

export const dynamic = "force-dynamic";

const ALLOWED_RANGES = new Set([7, 30, 90, 365]);

type DailyRow = { day: string; event: string; count: number };
type BreakdownRow = {
  event: string;
  dimension_name: string;
  dimension_value: string;
  count: number;
};

const EVENT_LABELS: Record<string, string> = {
  page_view: "Public page views",
  publication_search: "Publication searches",
  publication_filter: "Publication filter actions",
  report_web_view: "Web report views",
  report_pdf_view: "PDF opens",
  report_pdf_download: "PDF downloads",
  application_page_view: "Application page views",
  application_submit_success: "Successful applications",
  application_validation_failure: "Application validation failures",
};

function countFor(rows: readonly BreakdownRow[], event: string): number {
  return rows
    .filter((row) => row.event === event)
    .reduce((total, row) => total + Number(row.count || 0), 0);
}

function friendlyDimension(value: string): string {
  return titleCaseStatus(value.replace(/:/g, " "));
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin("/admin/analytics");
  const params = await searchParams;
  const requestedDays = Number(params.days ?? 30);
  const days = ALLOWED_RANGES.has(requestedDays) ? requestedDays : 30;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startDay = start.toISOString().slice(0, 10);

  const [daily, breakdown] = await Promise.all([
    database()
      .prepare(
        `SELECT day, event, SUM(count) AS count
         FROM analytics_daily WHERE day >= ?
         GROUP BY day, event ORDER BY day DESC, event ASC`,
      )
      .bind(startDay)
      .all<DailyRow>(),
    database()
      .prepare(
        `SELECT event, dimension_name, dimension_value, SUM(count) AS count
         FROM analytics_daily WHERE day >= ?
         GROUP BY event, dimension_name, dimension_value
         ORDER BY event ASC, count DESC, dimension_value ASC`,
      )
      .bind(startDay)
      .all<BreakdownRow>(),
  ]);

  const totals = breakdown.results;
  const pageViews = countFor(totals, "page_view");
  const webReportViews = countFor(totals, "report_web_view");
  const pdfEngagement =
    countFor(totals, "report_pdf_view") +
    countFor(totals, "report_pdf_download");
  const applications = countFor(totals, "application_submit_success");
  const enabled = analyticsEnabled(
    (env as unknown as { ANALYTICS_ENABLED?: string }).ANALYTICS_ENABLED,
  );

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Aggregate analytics"
        description="Cookie-free, first-party daily counters. Reports never contain visitor identifiers, IP addresses, user agents, referrers, search text or application form values."
      />

      {!enabled ? (
        <div className={styles.noticeWarning} role="status">
          Analytics collection is disabled in this environment. Set the hosted
          <code> ANALYTICS_ENABLED </code> value to <code>true</code> only after
          approving the privacy notice and retention policy.
        </div>
      ) : null}

      <form className={styles.filters} method="get" aria-label="Analytics reporting period">
        <div className={styles.fieldQuarter}>
          <label className={styles.label} htmlFor="analytics-days">Reporting period</label>
          <select className={styles.select} id="analytics-days" name="days" defaultValue={days}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 365 days</option>
          </select>
        </div>
        <div className={`${styles.fieldWide} ${styles.inlineActions}`}>
          <button className={styles.buttonSecondary} type="submit">Update report</button>
          {days !== 30 ? <Link className={styles.buttonQuiet} href="/admin/analytics">Reset</Link> : null}
        </div>
      </form>

      <section className={styles.stats} aria-label={`Totals for the last ${days} days`}>
        <StatCard label="Public page views" value={pageViews} note={`${days}-day total`} />
        <StatCard label="Web report views" value={webReportViews} note="Strategic, Legal and Markets" />
        <StatCard label="PDF interactions" value={pdfEngagement} note="Opens and downloads" />
        <StatCard label="Applications submitted" value={applications} note="Successful submissions only" />
      </section>

      <Panel title="Daily activity" meta={`Last ${days} days`}>
        {daily.results.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Date</th><th>Activity</th><th>Count</th></tr></thead>
              <tbody>
                {daily.results.map((row) => (
                  <tr key={`${row.day}:${row.event}`}>
                    <td><time dateTime={row.day}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${row.day}T00:00:00Z`))}</time></td>
                    <td>{EVENT_LABELS[row.event] ?? friendlyDimension(row.event)}</td>
                    <td>{Number(row.count || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No aggregate activity yet">
            {enabled
              ? "Counters will appear after visitors use the public website."
              : "Collection is disabled, so no visitor events are being stored."}
          </EmptyState>
        )}
      </Panel>

      <Panel title="Activity breakdown" meta="Approved low-cardinality categories only">
        {totals.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Activity</th><th>Category</th><th>Count</th></tr></thead>
              <tbody>
                {totals.map((row) => (
                  <tr key={`${row.event}:${row.dimension_name}:${row.dimension_value}`}>
                    <td>{EVENT_LABELS[row.event] ?? friendlyDimension(row.event)}</td>
                    <td>{row.dimension_name === "none" ? "All" : friendlyDimension(row.dimension_value)}</td>
                    <td>{Number(row.count || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No breakdown is available">Choose another reporting period or wait for the first aggregate events.</EmptyState>
        )}
      </Panel>
    </>
  );
}
