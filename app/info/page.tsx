import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/site/page-intro";
import { getPublishedContent } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn why M&A Watch exists, how our student-led research works and what our network offers its members.",
  alternates: { canonical: "/info" },
};

const values = [
  ["01", "Integrity", "We distinguish evidence from opinion, check our sources and take responsibility for the work we publish."],
  ["02", "Curiosity", "We ask better questions, pursue original insight and look beyond the headline terms of a transaction."],
  ["03", "Capability", "We build practical research, writing and commercial skills through ambitious work and careful feedback."],
  ["04", "Collaboration", "We share ideas openly and believe a diverse, supportive network produces more useful analysis."],
] as const;

export default async function InfoPage() {
  const content = await getPublishedContent("info.page");
  return (
    <main className="info-page">
      <PageIntro eyebrow="About M&A Watch" title={content?.title || "Opening the deal room to the next generation."} tone="dark">
        <p>
          {content?.body || "We give university students a platform to understand landmark M&A activity, publish high-quality research and develop the judgement demanded by finance and law."}
        </p>
      </PageIntro>

      <section className="story-section section-pad">
        <div className="site-shell story-section__grid">
          <p className="section-index">01 / Why we exist</p>
          <div className="story-section__lead">
            <p className="display-copy">
              Potential is everywhere. Access to practical experience is not.
            </p>
          </div>
          <div className="story-section__copy">
            <p>
              Mergers and acquisitions, investment banking and corporate law can feel
              exclusive to students encountering them for the first time. We bridge that
              gap through meaningful, publishable work.
            </p>
            <p>
              Members research past transactions, test the original strategic case and
              explain how law, markets and execution shaped the result. The process builds
              knowledge that lectures alone cannot provide.
            </p>
          </div>
        </div>
      </section>

      <section className="mission-section section-pad" aria-labelledby="mission-title">
        <div className="site-shell">
          <p className="section-index section-index--light">02 / Mission and vision</p>
          <h2 id="mission-title">Build understanding. Expand opportunity.</h2>
          <div className="mission-grid">
            <article>
              <p>Our mission</p>
              <h3>Learn by producing work that matters.</h3>
              <p>
                Give students their first practical insight into M&amp;A by researching and
                publishing rigorous retrospectives on significant transactions.
              </p>
            </article>
            <article>
              <p>Our vision</p>
              <h3>A global student network for deal intelligence.</h3>
              <p>
                Build an accessible body of research and connect students across
                universities with one another, alumni and industry.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="process-section section-pad" aria-labelledby="process-title">
        <div className="site-shell">
          <div className="section-heading">
            <div>
              <p className="section-index">03 / How we work</p>
              <h2 id="process-title">From question to publication.</h2>
            </div>
            <p>Every report passes through a structured research and editorial process.</p>
          </div>
          <ol className="process-grid">
            <li><span>01</span><h3>Choose the question</h3><p>Identify a transaction, legal issue or market theme worth understanding in depth.</p></li>
            <li><span>02</span><h3>Build the evidence</h3><p>Research primary materials, credible analysis and the context surrounding the event.</p></li>
            <li><span>03</span><h3>Test the argument</h3><p>Work with editors to challenge assumptions, strengthen structure and clarify the insight.</p></li>
            <li><span>04</span><h3>Share the work</h3><p>Publish an accessible report that helps the wider student community learn.</p></li>
          </ol>
        </div>
      </section>

      <section className="values-section section-pad" aria-labelledby="values-title">
        <div className="site-shell">
          <div className="section-heading section-heading--compact">
            <div><p className="section-index">04 / Our values</p><h2 id="values-title">The standard behind the work.</h2></div>
          </div>
          <div className="values-grid">
            {values.map(([number, title, body]) => (
              <article key={title}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-cta section-pad">
        <div className="site-shell home-cta__panel">
          <div><p className="eyebrow">Explore the work</p><h2>See our principles in practice.</h2></div>
          <div><p>Start with our latest strategic analysis, or find out how to contribute to the next edition.</p><div className="button-row"><Link className="button button--dark" href="/reports/strategic">Read reports <span aria-hidden="true">→</span></Link><Link className="text-link" href="/apply">Apply to join <span aria-hidden="true">↗</span></Link></div></div>
        </div>
      </section>
    </main>
  );
}
