import type { ReactNode } from "react";

interface PageIntroProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  tone?: "light" | "dark";
}

export function PageIntro({
  eyebrow,
  title,
  children,
  aside,
  tone = "light",
}: PageIntroProps) {
  return (
    <header className={`page-intro page-intro--${tone}`}>
      <div className="site-shell page-intro__grid">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        <div className="page-intro__copy">{children}</div>
        {aside ? <div className="page-intro__aside">{aside}</div> : null}
      </div>
    </header>
  );
}
