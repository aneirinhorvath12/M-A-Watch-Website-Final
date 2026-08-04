import Link from "next/link";
import Image from "next/image";
import {
  formatPublicationDate,
  getPublicationHref,
  getPublicationTypeLabel,
  type Publication,
} from "@/lib/publications";
import type { PublicApplicationSettings } from "@/lib/public-content";
import type {
  BasicPageContent,
  HomepageEditorialContent,
} from "@/lib/site-content";

export function HomePageContent({
  featured,
  heroContent,
  overviewContent,
  editorialContent,
  applicationSettings,
}: {
  featured: Publication[];
  heroContent: BasicPageContent;
  overviewContent: BasicPageContent;
  editorialContent: HomepageEditorialContent;
  applicationSettings: PublicApplicationSettings;
}) {
  const leadPublication = featured[0];
  const leadParties = leadPublication?.type !== "markets" &&
    leadPublication?.structured.acquirer &&
    leadPublication.structured.target
    ? [leadPublication.structured.acquirer, leadPublication.structured.target]
    : leadPublication
      ? [leadPublication.title]
      : [];
  const {
    hero,
    purpose,
    latest,
    research,
    impact,
    application,
  } = editorialContent;

  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-hero__mesh" aria-hidden="true" />
        <div className="site-shell home-hero__grid">
          <div className="home-hero__content">
            <p className="eyebrow eyebrow--light">{hero.eyebrow}</p>
            <h1>{heroContent.title}</h1>
            <p className="home-hero__lede">{heroContent.body}</p>
            <div className="button-row">
              <Link className="button button--light" href={heroContent.ctaHref}>
                {heroContent.ctaLabel} <span aria-hidden="true">→</span>
              </Link>
              <Link className="text-link text-link--light" href={hero.secondaryCtaHref}>
                {hero.secondaryCtaLabel} <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <ul className="home-hero__disciplines" aria-label={hero.disciplinesAriaLabel}>
              {hero.disciplines.map((discipline, index) => <li key={`discipline-${index}`}>{discipline}</li>)}
            </ul>
          </div>

          <div
            className="deal-note"
            aria-label={leadPublication ? `${hero.featuredLabel}: ${leadPublication.title}` : hero.deskLabel}
          >
            <div className="deal-note__topline">
              <span>{leadPublication ? hero.featuredLabel : hero.deskLabel}</span>
              <span>{leadPublication ? getPublicationTypeLabel(leadPublication.type) : hero.awaitingLabel}</span>
            </div>
            <div className="deal-note__parties">
              {leadParties.length ? leadParties.map((party, index) => (
                <span key={`${party}-${index}`}>
                  {index > 0 ? <span className="deal-note__arrow" aria-hidden="true">→ </span> : null}
                  {party}
                </span>
              )) : <span>{hero.emptyMessage}</span>}
            </div>
            <div className="deal-note__chart" aria-hidden="true">
              <span /><span /><span /><span /><span /><span /><span />
            </div>
            <dl className="deal-note__facts">
              <div><dt>{hero.lensLabel}</dt><dd>{leadPublication ? getPublicationTypeLabel(leadPublication.type) : "—"}</dd></div>
              <div><dt>{hero.publishedLabel}</dt><dd>{leadPublication ? leadPublication.publicationDate.slice(0, 4) : "—"}</dd></div>
              <div><dt>{hero.chapterLabel}</dt><dd>{leadPublication?.chapter ?? hero.defaultChapter}</dd></div>
            </dl>
            {leadPublication ? (
              <Link href={getPublicationHref(leadPublication)}>
                {hero.readPublicationLabel} <span aria-hidden="true">↗</span>
              </Link>
            ) : null}
          </div>
        </div>
        <div className="home-hero__rule" aria-hidden="true">
          {hero.ruleLabels.map((label, index) => <span key={`hero-rule-${index}`}>{label}</span>)}
        </div>
      </section>

      <section className="home-intro section-pad">
        <div className="site-shell home-intro__grid">
          <p className="section-index">{purpose.eyebrow}</p>
          <div>
            <p className="display-copy">{overviewContent.title}</p>
            <div className="home-intro__body">
              <p>{overviewContent.body}</p>
              <Link className="text-link" href={overviewContent.ctaHref}>
                {overviewContent.ctaLabel} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="research-areas section-pad" aria-labelledby="research-areas-title">
        <div className="site-shell">
          <div className="section-heading">
            <div>
              <p className="section-index">{research.eyebrow}</p>
              <h2 id="research-areas-title">{research.title}</h2>
            </div>
            <p>{research.introduction}</p>
          </div>
          <div className="area-grid">
            {research.areas.map((area, index) => (
              <article className={`area-card area-card--0${(index % 3) + 1}`} key={`${area.number}-${area.title}`}>
                <div className="area-card__number">{area.number}</div>
                <p className="area-card__label">{area.label}</p>
                <h3>{area.title}</h3>
                <p>{area.body}</p>
                <Link href={area.href} aria-label={`${area.linkLabel}: ${area.title}`}>
                  {area.linkLabel} <span aria-hidden="true">↗</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="featured-work section-pad" aria-labelledby="featured-title">
        <div className="site-shell">
          <div className="section-heading section-heading--compact">
            <div>
              <p className="section-index">{latest.eyebrow}</p>
              <h2 id="featured-title">{latest.title}</h2>
            </div>
            <Link className="text-link" href={latest.ctaHref}>
              {latest.ctaLabel} <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="featured-grid">
            {featured.map((publication, index) => (
              <article className={`featured-card featured-card--${publication.type}`} key={publication.id}>
                <Link className="featured-card__visual" href={getPublicationHref(publication)} tabIndex={-1} aria-hidden="true">
                  {publication.cover ? (
                    <Image
                      className="featured-card__cover"
                      src={publication.cover.src}
                      alt=""
                      fill
                      sizes="(max-width: 760px) 100vw, 33vw"
                    />
                  ) : (
                    <>
                      <span className="featured-card__edition">{latest.editionPrefix} / {String(index + 1).padStart(2, "0")}</span>
                      <span className="featured-card__type">{getPublicationTypeLabel(publication.type)}</span>
                      <span className="featured-card__monogram" aria-hidden="true">
                        {publication.type === "strategic" ? "S" : publication.type === "legal" ? "L" : "M"}
                      </span>
                      <span className="featured-card__chapter">{publication.chapter ?? "M&A Watch"}</span>
                    </>
                  )}
                </Link>
                <div className="featured-card__content">
                  <p className="featured-card__meta">
                    <span>{getPublicationTypeLabel(publication.type)}</span>
                    <time dateTime={publication.publicationDate}>{formatPublicationDate(publication.publicationDate)}</time>
                  </p>
                  <h3><Link href={getPublicationHref(publication)}>{publication.title}</Link></h3>
                  <p>{publication.summary}</p>
                  <p className="featured-card__byline">
                    {publication.authors.length ? publication.authors.join(", ") : publication.chapter ?? latest.defaultByline}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="impact-section" aria-labelledby="impact-title">
        <div className="site-shell impact-section__grid">
          <div className="impact-section__copy">
            <p className="section-index section-index--light">{impact.eyebrow}</p>
            <h2 id="impact-title">{impact.title}</h2>
            <p>{impact.body}</p>
            <Link className="text-link text-link--light" href={impact.ctaHref}>
              {impact.ctaLabel} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <dl className="impact-stats">
            {impact.stats.map(({ value, label }) => (
              <div key={`${label}-${value}`}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="home-cta section-pad">
        <div className="site-shell home-cta__panel">
          <div>
            <p className="eyebrow">{applicationSettings.open ? application.openEyebrow : application.closedEyebrow}</p>
            <h2>{applicationSettings.open ? application.openTitle : application.closedTitle}</h2>
          </div>
          <div>
            <p>{application.body}</p>
            <Link className="button button--dark" href={application.ctaHref}>
              {applicationSettings.open ? application.openCtaLabel : application.closedCtaLabel} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
