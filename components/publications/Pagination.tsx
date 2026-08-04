import Link from "next/link";
import { publicationQueryString, type PublicationQuery } from "@/lib/publications";
import styles from "./publications.module.css";

export function Pagination({
  basePath,
  query,
  page,
  totalPages,
}: {
  basePath: string;
  query: PublicationQuery;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const collection =
    basePath === "/reports/strategic"
      ? "strategic"
      : basePath === "/reports/legal"
        ? "legal"
        : basePath === "/markets"
          ? "markets"
          : "all";

  return (
    <nav className={styles.pagination} aria-label="Publication pages">
      {page > 1 ? (
        <Link
          data-analytics-event="publication_filter"
          data-analytics-value={`pagination:${collection}`}
          href={`${basePath}${publicationQueryString(query, { page: page - 1 })}`}
        >
          <span aria-hidden="true">←</span> Previous
        </Link>
      ) : (
        <span aria-disabled="true">
          <span aria-hidden="true">←</span> Previous
        </span>
      )}
      <p>
        Page <strong>{page}</strong> of {totalPages}
      </p>
      {page < totalPages ? (
        <Link
          data-analytics-event="publication_filter"
          data-analytics-value={`pagination:${collection}`}
          href={`${basePath}${publicationQueryString(query, { page: page + 1 })}`}
        >
          Next <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <span aria-disabled="true">
          Next <span aria-hidden="true">→</span>
        </span>
      )}
    </nav>
  );
}
