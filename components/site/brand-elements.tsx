import Image from "next/image";
import type { ReactNode } from "react";

/**
 * The two-tone blue wave from the brand guidelines' title slides. Purely
 * decorative; content placed in `children` sits on the flat band beneath it.
 */
export function BrandWave({ children }: { children?: ReactNode }) {
  return (
    <div className="brand-wave">
      <svg
        className="brand-wave__curve"
        viewBox="0 0 1440 180"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path className="brand-wave__back" d="M0 180V168C520 166 1010 128 1440 0V180Z" />
        <path className="brand-wave__front" d="M0 180V176C540 176 1060 150 1440 30V180Z" />
      </svg>
      {children ? <div className="brand-wave__band">{children}</div> : null}
    </div>
  );
}

const VALUES: { icon: ReactNode; lead: ReactNode }[] = [
  {
    icon: (
      <Image
        src="/brand/logo-black-mark-96.png"
        width={30}
        height={32}
        alt=""
        unoptimized
      />
    ),
    lead: (
      <>
        <strong>Be yourself</strong> and strive for unique insights rather than simply following the trend.
      </>
    ),
  },
  {
    icon: (
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M3 26 12 13l4 5 4-7 9 15Z" fill="currentColor" />
        <path d="M18 11V4l6 2.2-6 2.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
    lead: (
      <>
        Our inherent <strong>curiosity and ambition</strong> will help us flourish and succeed.
      </>
    ),
  },
  {
    icon: (
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <circle cx="16" cy="13" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="16" cy="13" r="3.5" fill="currentColor" />
        <path d="m11 20-2.5 9 4-2 2 3 1.5-7M21 20l2.5 9-4-2-2 3-1.5-7" fill="currentColor" />
      </svg>
    ),
    lead: (
      <>
        We go above and beyond what is asked of us and commit to <strong>excellence</strong>.
      </>
    ),
  },
  {
    icon: (
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <circle cx="8" cy="7" r="3" fill="currentColor" />
        <circle cx="24" cy="7" r="3" fill="currentColor" />
        <path d="M4 12h8v8h-2v8H6v-8H4ZM20 12h8v8h-2v8h-4v-8h-2Z" fill="currentColor" />
        <path d="m17 12-3 6h3l-2 6 4-7h-3l2-5Z" fill="currentColor" />
      </svg>
    ),
    lead: (
      <>
        We aren&apos;t scared to share opinions and embody <strong>collaboration</strong> through our supportive team
        and diverse network.
      </>
    ),
  },
];

/** "Our Values and Ethos" from the brand guidelines. */
export function BrandValues({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className="brand-values section-pad" aria-labelledby="brand-values-title">
      <div className="site-shell">
        <div className="brand-values__heading">
          <p className="section-index">Our values and ethos</p>
          <Heading id="brand-values-title" className="brand-values__title">
            Strength. Integrity. Capability.
          </Heading>
        </div>
        <ul className="brand-values__grid">
          {VALUES.map((value, index) => (
            <li className="brand-values__card" key={index}>
              <span className="brand-values__icon">{value.icon}</span>
              <p>{value.lead}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Mission and vision statements from the brand guidelines' "About Us". */
export function MissionVision() {
  return (
    <section className="mission-vision section-pad" aria-label="Mission and vision">
      <div className="site-shell mission-vision__grid">
        <article className="mission-vision__card">
          <p className="eyebrow">Our mission</p>
          <p className="mission-vision__text">
            To provide an opportunity for university students to gain their first insights into M&amp;A activity by
            producing high-quality retrospectives on some of the most significant and influential deals in history.
          </p>
        </article>
        <article className="mission-vision__card mission-vision__card--dark">
          <p className="eyebrow eyebrow--light">Our vision</p>
          <p className="mission-vision__text">
            A comprehensive database of the most significant and influential M&amp;A deals in history, revealing what
            drives their successes and failures, and an international network of passionate university students and
            industry alumni.
          </p>
        </article>
      </div>
    </section>
  );
}
