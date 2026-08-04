import Link from "next/link";
import type {
  PublicationFilters as AvailableFilters,
  PublicationQuery,
} from "@/lib/publications";
import styles from "./publications.module.css";

export interface PublicationFiltersProps {
  action: string;
  query: PublicationQuery;
  filters: AvailableFilters;
  showType?: boolean;
  showAttribution?: boolean;
}

export function PublicationFilters({
  action,
  query,
  filters,
  showType = false,
  showAttribution = true,
}: PublicationFiltersProps) {
  const hasFilters = Boolean(query.q || query.year || query.by || query.type);
  const collection =
    action === "/reports/strategic"
      ? "strategic"
      : action === "/reports/legal"
        ? "legal"
        : action === "/markets"
          ? "markets"
          : "all";

  return (
    <form
      action={action}
      className={styles.filterForm}
      data-analytics-publication-filters={collection}
      method="get"
      role="search"
    >
      <label className={styles.searchField}>
        <span>Search publications</span>
        <span className={styles.searchInputWrap}>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m21 21-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />
          </svg>
          <input
            defaultValue={query.q}
            maxLength={160}
            name="q"
            placeholder="Title, author, topic…"
            type="search"
          />
        </span>
      </label>
      <label className={styles.selectField}>
        <span>Year</span>
        <select defaultValue={query.year ?? ""} name="year">
          <option value="">All years</option>
          {filters.years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      {showType ? (
        <label className={styles.selectField}>
          <span>Publication type</span>
          <select defaultValue={query.type ?? ""} name="type">
            <option value="">All publications</option>
            <option value="strategic">Strategic</option>
            <option value="legal">Legal</option>
            <option value="markets">Markets</option>
          </select>
        </label>
      ) : null}
      {showAttribution && filters.attributions.length ? (
        <label className={styles.selectField}>
          <span>Author or chapter</span>
          <select defaultValue={query.by ?? ""} name="by">
            <option value="">All contributors</option>
            {filters.attributions.map((attribution) => (
              <option key={attribution} value={attribution}>
                {attribution}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className={styles.filterActions}>
        <button className={styles.filterSubmit} type="submit">
          Apply filters
        </button>
        {hasFilters ? (
          <Link
            className={styles.filterReset}
            data-analytics-event="publication_filter"
            data-analytics-value={`reset:${collection}`}
            href={action}
          >
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
