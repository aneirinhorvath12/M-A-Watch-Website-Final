import Link from "next/link";
import {
  formatPublicationDate,
  getPublicationHref,
  getPublicationTypeLabel,
  type Publication,
} from "@/lib/publications";
import styles from "./publications.module.css";

function initials(title: string): string {
  return title
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase("en-GB"))
    .join("");
}

export function PublicationCard({ publication }: { publication: Publication }) {
  const href = getPublicationHref(publication);
  const attribution = publication.authors.length
    ? publication.authors.join(", ")
    : publication.chapter;

  return (
    <article className={styles.publicationCard} data-publication-type={publication.type}>
      <Link
        aria-label={`Read ${publication.title}`}
        className={styles.cardArtwork}
        href={href}
      >
        <span className={styles.cardArtworkRule} />
        <span className={styles.cardArtworkType}>
          {getPublicationTypeLabel(publication.type)}
        </span>
        <span className={styles.cardArtworkInitials} aria-hidden="true">
          {initials(publication.title)}
        </span>
        <span className={styles.cardArtworkBrand}>M&amp;A WATCH</span>
      </Link>
      <div className={styles.cardContent}>
        <div className={styles.cardMeta}>
          <span>{getPublicationTypeLabel(publication.type)}</span>
          <time dateTime={publication.publicationDate}>
            {formatPublicationDate(publication.publicationDate)}
          </time>
        </div>
        <h2 className={styles.cardTitle}>
          <Link href={href}>{publication.title}</Link>
        </h2>
        <p className={styles.cardSummary}>{publication.summary}</p>
        {attribution ? (
          <p className={styles.cardAttribution}>
            <span>By</span> {attribution}
          </p>
        ) : null}
        <Link className={styles.cardLink} href={href}>
          {publication.type === "markets" ? "View issue" : "Read report"}
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </article>
  );
}
