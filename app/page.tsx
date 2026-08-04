import type { Metadata } from "next";
import Link from "next/link";
import {
  formatPublicationDate,
  getLiveFeaturedPublications,
  getPublicationHref,
  getPublicationTypeLabel,
} from "@/lib/publications";
import { getPublishedContent, getPublicApplicationSettings } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Student-led deal intelligence",
  description:
    "Explore student-led strategic, legal and markets analysis from M&A Watch, or apply to join our growing research network.",
  alternates: { canonical: "/" },
};

const areas = [
  {
    number: "01",
    title: "Strategic",
    label: "Deal reports",
    body: "Retrospective analysis of the rationale, valuation and execution behind transactions that reshaped their industries.",
    href: "/reports/strategic",
    link: "Explore strategic reports",
  },
  {
    number: "02",
    title: "Legal",
    label: "Law and regulation",
    body: "Clear examinations of the cases, rules and regulatory decisions that determine how landmark deals get done.",
    href: "/reports/legal",
    link: "Explore legal reports",
  },
  {
    number: "03",
    title: "Markets",
    label: "Global outlook",
    body: "Student perspectives on macro themes, asset classes and the market conditions surrounding corporate activity.",
    href: "/markets",
    link: "Read markets newsletters",
  },
];

const impact = [
  ["19", "Published reports"],
  ["6+", "University chapters"],
  ["20+", "Student analysts"],
  ["3", "Research divisions"],
] as const;

export default async function Home() {
  const [featured, heroContent, overviewContent, applicationSettings] = await Promise.all([
    getLiveFeaturedPublications(3),
    getPublishedContent("homepage.hero"),
    getPublishedContent("homepage.overview"),
    getPublicApplicationSettings(),
  ]);

  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-hero__mesh" aria-hidden="true" />
        <div className="site-shell home-hero__grid">
          <div className="home-hero__content">
            <p className="eyebrow eyebrow--light">Independent. Student-led. Global in outlook.</p>
            <h1>{heroContent?.title || "The deals that shape markets, examined by the people entering them."}</h1>
            <p className="home-hero__lede">
              {heroContent?.body || "M&A Watch brings together ambitious students to research the strategy, law and market forces behind history's most consequential transactions."}
            </p>
            <div className="button-row">
              <Link className="button button--light" href={heroContent?.ctaHref || "/reports/strategic"}>
                {heroContent?.ctaLabel || "Explore our research"} <span aria-hidden="true">→</span>
              </Link>
              <Link className="text-link text-link--light" href="/apply">
                Join M&amp;A Watch <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <ul className="home-hero__disciplines" aria-label="Our research disciplines">
              <li>Finance</li>
              <li>Law</li>
              <li>Markets</li>
            </ul>
          </div>

          <div className="deal-note" aria-label="Featured deal note: AMD and ZT Systems">
            <div className="deal-note__topline">
              <span>Deal note 01</span>
              <span>AI infrastructure</span>
            </div>
            <div className="deal-note__parties">
              <span>AMD</span>
              <span className="deal-note__arrow" aria-hidden="true">→</span>
              <span>ZT Systems</span>
            </div>
            <div className="deal-note__chart" aria-hidden="true">
              <span /><span /><span /><span /><span /><span /><span />
            </div>
            <dl className="deal-note__facts">
              <div><dt>Lens</dt><dd>Strategic</dd></div>
              <div><dt>Market</dt><dd>United States</dd></div>
              <div><dt>Status</dt><dd>Completed</dd></div>
            </dl>
            <Link href="/reports/strategic/amd-acquisition-zt-systems">
              Read the deal report <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
        <div className="home-hero__rule" aria-hidden="true">
          <span>Strategy</span><span>Regulation</span><span>Valuation</span><span>Execution</span>
        </div>
      </section>

      <section className="home-intro section-pad">
        <div className="site-shell home-intro__grid">
          <p className="section-index">01 / Our purpose</p>
          <div>
            <p className="display-copy">
              {overviewContent?.title || "We turn complex transactions into practical, rigorous learning."}
            </p>
            <div className="home-intro__body">
              <p>
                {overviewContent?.body || "Our analysts investigate what happened, why it mattered and what the market can learn from it. Every report is designed to be useful to a curious reader, not only an industry insider."}
              </p>
              <Link className="text-link" href={overviewContent?.ctaHref || "/info"}>
                {overviewContent?.ctaLabel || "Discover M&A Watch"} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="research-areas section-pad" aria-labelledby="research-areas-title">
        <div className="site-shell">
          <div className="section-heading">
            <div>
              <p className="section-index">02 / Our work</p>
              <h2 id="research-areas-title">Three lenses. One market.</h2>
            </div>
            <p>
              Read a transaction from the commercial, legal and market perspectives
              that determine its outcome.
            </p>
          </div>
          <div className="area-grid">
            {areas.map((area) => (
              <article className={`area-card area-card--${area.number}`} key={area.number}>
                <div className="area-card__number">{area.number}</div>
                <p className="area-card__label">{area.label}</p>
                <h3>{area.title}</h3>
                <p>{area.body}</p>
                <Link href={area.href} aria-label={`${area.link}: ${area.title}`}>
                  {area.link} <span aria-hidden="true">↗</span>
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
              <p className="section-index">03 / Latest research</p>
              <h2 id="featured-title">Current thinking</h2>
            </div>
            <Link className="text-link" href="/reports/strategic">
              View all publications <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="featured-grid">
            {featured.map((publication, index) => (
              <article className={`featured-card featured-card--${publication.type}`} key={publication.id}>
                <Link className="featured-card__visual" href={getPublicationHref(publication)} tabIndex={-1} aria-hidden="true">
                  <span className="featured-card__edition">M&amp;A / {String(index + 1).padStart(2, "0")}</span>
                  <span className="featured-card__type">{getPublicationTypeLabel(publication.type)}</span>
                  <span className="featured-card__monogram" aria-hidden="true">
                    {publication.type === "strategic" ? "S" : publication.type === "legal" ? "L" : "M"}
                  </span>
                  <span className="featured-card__chapter">{publication.chapter ?? "M&A Watch"}</span>
                </Link>
                <div className="featured-card__content">
                  <p className="featured-card__meta">
                    <span>{getPublicationTypeLabel(publication.type)}</span>
                    <time dateTime={publication.publicationDate}>{formatPublicationDate(publication.publicationDate)}</time>
                  </p>
                  <h3>
                    <Link href={getPublicationHref(publication)}>{publication.title}</Link>
                  </h3>
                  <p>{publication.summary}</p>
                  <p className="featured-card__byline">
                    {publication.authors.length ? publication.authors.join(", ") : publication.chapter ?? "M&A Watch Research"}
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
            <p className="section-index section-index--light">04 / Growing together</p>
            <h2 id="impact-title">Research with reach.</h2>
            <p>
              Our inter-university network gives students a platform to build
              commercial judgement, publish ambitious work and learn from one another.
            </p>
            <Link className="text-link text-link--light" href="/team">
              Meet the network <span aria-hidden="true">→</span>
            </Link>
          </div>
          <dl className="impact-stats">
            {impact.map(([value, label]) => (
              <div key={label}>
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
            <p className="eyebrow">{applicationSettings.open ? "2026 applications are open" : "Applications are currently closed"}</p>
            <h2>{applicationSettings.open ? "Put your curiosity to work." : "Stay close to the next opportunity."}</h2>
          </div>
          <div>
            <p>
              Join a division in Finance, Law or Markets and help us make rigorous deal
              analysis accessible to the next generation.
            </p>
            <Link className="button button--dark" href="/apply">
              {applicationSettings.open ? "Start your application" : "View application information"} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
