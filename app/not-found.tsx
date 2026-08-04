import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <div className="not-found-page__number" aria-hidden="true">404</div>
      <div className="site-shell not-found-page__content">
        <p className="eyebrow eyebrow--light">Page not found</p>
        <h1>This deal trail ends here.</h1>
        <p>
          The page may have moved, been archived or never existed. Try the latest
          research or return to the homepage.
        </p>
        <div className="button-row">
          <Link className="button button--light" href="/">Return home <span aria-hidden="true">→</span></Link>
          <Link className="text-link text-link--light" href="/reports/strategic">Browse reports <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </main>
  );
}
