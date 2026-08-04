import Link from "next/link";
import Image from "next/image";
import {
  formatPublicationDate,
  getLiveAdjacentPublications,
  getPublicationHref,
  getLiveRelatedPublications,
  type MarketsPublication,
} from "@/lib/publications";
import { PdfActions } from "./PdfActions";
import { PdfViewer } from "./PdfViewer";
import { RelatedPublications } from "./RelatedPublications";
import styles from "./publications.module.css";

export async function MarketsPublicationPage({
  publication,
  privatePreview = false,
}: {
  publication: MarketsPublication;
  privatePreview?: boolean;
}) {
  const [related, adjacent] = await Promise.all([
    getLiveRelatedPublications(publication, 3),
    getLiveAdjacentPublications(publication),
  ]);

  return (
    <main className={styles.detailPage}>
      <header className={styles.marketsHero}>
        <div className={styles.pageContainer}>
          <nav className={styles.breadcrumbsLight} aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/markets">Markets</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Issue</span>
          </nav>
          <div className={styles.marketsHeroGrid}>
            <div>
              <p className={styles.eyebrowLight}>Markets · Monthly briefing</p>
              <h1>{publication.title}</h1>
              <p>{publication.summary}</p>
              <PdfActions filename={publication.pdfFilename} pdfUrl={publication.pdfUrl} publicationType={publication.type} />
            </div>
            {publication.cover ? (
              <figure className={styles.marketsCover}>
                <Image
                  src={publication.cover.src}
                  alt={publication.cover.alt}
                  width={publication.cover.width}
                  height={publication.cover.height}
                  sizes="(max-width: 900px) 100vw, 36vw"
                  unoptimized={privatePreview}
                />
              </figure>
            ) : (
              <div className={styles.marketsIssueArtwork} aria-hidden="true">
                <span>M&amp;A WATCH</span>
                <strong>MARKETS</strong>
                <small>{formatPublicationDate(publication.publicationDate)}</small>
                <i />
              </div>
            )}
          </div>
          <dl className={styles.marketsMeta}>
            <div>
              <dt>Published</dt>
              <dd>{formatPublicationDate(publication.publicationDate)}</dd>
            </div>
            <div>
              <dt>Produced by</dt>
              <dd>{publication.authors.join(", ")}</dd>
            </div>
            {publication.chapter ? (
              <div>
                <dt>Team</dt>
                <dd>{publication.chapter}</dd>
              </div>
            ) : null}
            <div>
              <dt>Format</dt>
              <dd>Hosted PDF</dd>
            </div>
          </dl>
        </div>
      </header>

      {publication.placeholderContent ? (
        <div className={styles.demoNotice} role="note">
          <div className={styles.pageContainer}>
            <strong>Demonstration issue</strong>
            <span>A representative report is standing in until a Markets PDF is supplied.</span>
          </div>
        </div>
      ) : null}

      <div className={styles.pageContainer}>
        <PdfViewer
          filename={publication.pdfFilename}
          pdfUrl={publication.pdfUrl}
          publicationType={publication.type}
          title={publication.title}
        />
      </div>

      <nav className={styles.adjacentNavigation} aria-label="Adjacent Markets issues">
        <div className={styles.pageContainer}>
          {adjacent.newer ? (
            <Link href={getPublicationHref(adjacent.newer)}>
              <span>Newer issue</span>
              <strong>← {adjacent.newer.title}</strong>
            </Link>
          ) : (
            <span />
          )}
          {adjacent.older ? (
            <Link href={getPublicationHref(adjacent.older)}>
              <span>Older issue</span>
              <strong>{adjacent.older.title} →</strong>
            </Link>
          ) : (
            <span />
          )}
        </div>
      </nav>
      <RelatedPublications publications={related} title="More from Markets" />
    </main>
  );
}
