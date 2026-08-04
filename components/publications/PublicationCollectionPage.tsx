import Link from "next/link";
import type {
  PublicationFilters as AvailableFilters,
  PublicationQuery,
  PublicationSearchResult,
  PublicationType,
} from "@/lib/publications";
import { Pagination } from "./Pagination";
import { PublicationCard } from "./PublicationCard";
import { PublicationFilters } from "./PublicationFilters";
import styles from "./publications.module.css";

export interface PublicationCollectionPageProps {
  eyebrow: string;
  title: string;
  introduction: string;
  basePath: string;
  query: PublicationQuery;
  filters: AvailableFilters;
  result: PublicationSearchResult;
  activeType?: PublicationType;
  showTypeFilter?: boolean;
  showAttributionFilter?: boolean;
}

export function PublicationCollectionPage({
  eyebrow,
  title,
  introduction,
  basePath,
  query,
  filters,
  result,
  activeType,
  showTypeFilter = false,
  showAttributionFilter = true,
}: PublicationCollectionPageProps) {
  const filtered = Boolean(query.q || query.year || query.by || query.type);

  return (
    <main className={styles.collectionPage}>
      <section className={styles.collectionHero}>
        <div className={styles.pageContainer}>
          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{eyebrow}</span>
          </nav>
          <div className={styles.collectionHeroGrid}>
            <div>
              <p className={styles.eyebrow}>{eyebrow}</p>
              <h1>{title}</h1>
            </div>
            <p className={styles.collectionIntro}>{introduction}</p>
          </div>
          <nav className={styles.collectionTabs} aria-label="Publication collections">
            <Link aria-current={!activeType ? "page" : undefined} href="/reports">
              All reports
            </Link>
            <Link
              aria-current={activeType === "strategic" ? "page" : undefined}
              href="/reports/strategic"
            >
              Strategic
            </Link>
            <Link
              aria-current={activeType === "legal" ? "page" : undefined}
              href="/reports/legal"
            >
              Legal
            </Link>
            <Link
              aria-current={activeType === "markets" ? "page" : undefined}
              href="/markets"
            >
              Markets
            </Link>
          </nav>
        </div>
      </section>

      <section className={styles.collectionContent} aria-labelledby="publication-results-title">
        <div className={styles.pageContainer}>
          <PublicationFilters
            action={basePath}
            filters={filters}
            query={query}
            showAttribution={showAttributionFilter}
            showType={showTypeFilter}
          />
          <div className={styles.resultsHeader} aria-live="polite">
            <h2 id="publication-results-title">
              {filtered ? "Search results" : "Latest publications"}
            </h2>
            <p>
              {result.total} {result.total === 1 ? "publication" : "publications"}
            </p>
          </div>
          {result.items.length ? (
            <div className={styles.publicationGrid}>
              {result.items.map((publication) => (
                <PublicationCard key={publication.id} publication={publication} />
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <span aria-hidden="true">⌁</span>
              <h2>No publications found</h2>
              <p>Try a broader search, choose a different year, or clear the filters.</p>
              <Link href={basePath}>View all publications</Link>
            </div>
          )}
          <Pagination
            basePath={basePath}
            page={result.page}
            query={query}
            totalPages={result.totalPages}
          />
        </div>
      </section>
    </main>
  );
}
