import type { ReactNode } from "react";
import { PageIntro } from "./page-intro";

interface PolicySection {
  title: string;
  content: ReactNode;
}

export function PolicyLayout({
  eyebrow,
  title,
  introduction,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  introduction: ReactNode;
  updated: string;
  sections: PolicySection[];
}) {
  return (
    <main className="policy-page">
      <PageIntro eyebrow={eyebrow} title={title} tone="dark">
        <p>{introduction}</p>
        <p className="page-intro__meta">Last updated {updated}</p>
      </PageIntro>
      <div className="site-shell policy-layout">
        <aside className="policy-layout__aside" aria-label="On this page">
          <p>On this page</p>
          <ol>
            {sections.map((section, index) => (
              <li key={section.title}>
                <a href={`#section-${index + 1}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </aside>
        <div className="policy-layout__content">
          {sections.map((section, index) => (
            <section key={section.title} id={`section-${index + 1}`}>
              <p className="policy-layout__index">{String(index + 1).padStart(2, "0")}</p>
              <h2>{section.title}</h2>
              <div>{section.content}</div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
