import Link from "next/link";
import {
  getPublicationHref,
  type Publication,
} from "@/lib/publications";
import { PublicationCard } from "./PublicationCard";
import styles from "./publications.module.css";

export function RelatedPublications({
  publications,
  title = "Continue reading",
}: {
  publications: Publication[];
  title?: string;
}) {
  if (!publications.length) return null;
  return (
    <section className={styles.relatedSection} aria-labelledby="related-publications-title">
      <div className={styles.pageContainer}>
        <div className={styles.relatedHeader}>
          <div>
            <p className={styles.eyebrow}>From the archive</p>
            <h2 id="related-publications-title">{title}</h2>
          </div>
          <Link
            href={publications[0]?.type === "markets" ? "/markets" : `/reports/${publications[0]?.type}`}
          >
            Browse the collection <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className={styles.publicationGrid}>
          {publications.map((publication) => (
            <PublicationCard key={publication.id} publication={publication} />
          ))}
        </div>
        <noscript>
          {publications.map((publication) => (
            <a href={getPublicationHref(publication)} key={publication.id}>
              {publication.title}
            </a>
          ))}
        </noscript>
      </div>
    </section>
  );
}
