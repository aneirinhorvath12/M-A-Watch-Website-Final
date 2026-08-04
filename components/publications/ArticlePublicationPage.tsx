import Link from "next/link";
import Image from "next/image";
import {
  formatPublicationDate,
  getLiveAdjacentPublications,
  getPublicationHref,
  getPublicationTypeLabel,
  getLiveRelatedPublications,
  type ArticlePublication,
} from "@/lib/publications";
import { absoluteSiteUrl, publicationSocialImagePath } from "@/lib/seo";
import { ArticleBody } from "./ArticleBody";
import { PdfActions } from "./PdfActions";
import { RelatedPublications } from "./RelatedPublications";
import styles from "./publications.module.css";

function headingText(publication: ArticlePublication) {
  return publication.body.flatMap((block) =>
    block.type === "heading" && block.level === 2
      ? [
          {
            id: block.id,
            text: block.content.map((item) => item.text).join(""),
          },
        ]
      : [],
  );
}

export async function ArticlePublicationPage({
  publication,
  privatePreview = false,
}: {
  publication: ArticlePublication;
  privatePreview?: boolean;
}) {
  const [related, adjacent] = await Promise.all([
    getLiveRelatedPublications(publication, 3),
    getLiveAdjacentPublications(publication),
  ]);
  const headings = headingText(publication);
  const collectionHref = `/reports/${publication.type}`;
  const collectionLabel = publication.type === "strategic" ? "Strategic" : "Legal";
  const structuredItems = [
    ["Sector", publication.structured.sector],
    ["Geography", publication.structured.geography],
    ["Deal status", publication.structured.dealStatus],
    ["Deal value", publication.structured.dealValue],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const canonicalUrl = absoluteSiteUrl(getPublicationHref(publication));

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: publication.title,
    datePublished: publication.publishedAt ?? publication.publicationDate,
    dateModified: publication.updatedAt,
    author: publication.authors.map((name) => ({ "@type": "Person", name })),
    publisher: {
      "@type": "Organization",
      name: "M&A Watch",
      logo: { "@type": "ImageObject", url: absoluteSiteUrl("/brand/logo-black-mark.png") },
    },
    description: publication.summary,
    image: absoluteSiteUrl(publication.cover?.src ?? publicationSocialImagePath(publication)),
    url: canonicalUrl,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
  };

  return (
    <main className={styles.detailPage}>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema).replace(/</g, "\\u003c") }}
        type="application/ld+json"
      />
      <header className={styles.articleHero} data-publication-type={publication.type}>
        <div className={styles.pageContainer}>
          <nav className={styles.breadcrumbsLight} aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href={collectionHref}>{collectionLabel}</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Report</span>
          </nav>
          <div className={styles.articleHeroGrid}>
            <div className={styles.articleHeroMain}>
              <p className={styles.eyebrowLight}>{getPublicationTypeLabel(publication.type)}</p>
              <h1>{publication.title}</h1>
              <p className={styles.articleStandfirst}>{publication.summary}</p>
            </div>
            <div className={styles.articleHeroAside}>
              <dl className={styles.articleMeta}>
                <div>
                  <dt>Published</dt>
                  <dd>
                    <time dateTime={publication.publicationDate}>
                      {formatPublicationDate(publication.publicationDate)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>{publication.authors.length === 1 ? "Author" : "Authors"}</dt>
                  <dd>{publication.authors.join(", ")}</dd>
                </div>
                {publication.chapter ? (
                  <div>
                    <dt>Chapter</dt>
                    <dd>{publication.chapter}</dd>
                  </div>
                ) : null}
              </dl>
              <PdfActions filename={publication.pdfFilename} pdfUrl={publication.pdfUrl} publicationType={publication.type} />
            </div>
          </div>
          {publication.cover ? (
            <figure className={styles.detailCover}>
              <Image
                src={publication.cover.src}
                alt={publication.cover.alt}
                width={publication.cover.width}
                height={publication.cover.height}
                sizes="(max-width: 900px) 100vw, 1180px"
                unoptimized={privatePreview}
              />
            </figure>
          ) : null}
        </div>
      </header>

      {publication.placeholderContent ? (
        <div className={styles.demoNotice} role="note">
          <div className={styles.pageContainer}>
            <strong>Demonstration article</strong>
            <span>
              The web layout is ready; the editorial team should approve parsed copy against the
              original PDF before launch.
            </span>
          </div>
        </div>
      ) : null}

      <div className={styles.articleLayout}>
        <aside className={styles.articleRail} aria-label="Report navigation">
          {headings.length ? (
            <nav className={styles.tableOfContents} aria-labelledby="contents-title">
              <p id="contents-title">On this page</p>
              <ol>
                {headings.map((heading) => (
                  <li key={heading.id}>
                    <a href={`#${heading.id}`}>{heading.text}</a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          {structuredItems.length ? (
            <dl className={styles.dealFacts}>
              {structuredItems.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <div className={styles.sourceCard}>
            <span aria-hidden="true">PDF</span>
            <p>Prefer the original?</p>
            <a
              data-analytics-event="report_pdf_view"
              data-analytics-value={publication.type}
              href={publication.pdfUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open source report <span aria-hidden="true">↗</span>
            </a>
          </div>
        </aside>
        <article className={styles.articleColumn}>
          <ArticleBody blocks={publication.body} privatePreview={privatePreview} />
        </article>
      </div>

      <nav className={styles.adjacentNavigation} aria-label="Adjacent reports">
        <div className={styles.pageContainer}>
          {adjacent.newer ? (
            <Link href={getPublicationHref(adjacent.newer)}>
              <span>Newer report</span>
              <strong>← {adjacent.newer.title}</strong>
            </Link>
          ) : (
            <span />
          )}
          {adjacent.older ? (
            <Link href={getPublicationHref(adjacent.older)}>
              <span>Older report</span>
              <strong>{adjacent.older.title} →</strong>
            </Link>
          ) : (
            <span />
          )}
        </div>
      </nav>
      <RelatedPublications publications={related} title="Related reports" />
    </main>
  );
}
