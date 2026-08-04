import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Application received",
  robots: { index: false, follow: false },
};

export default function ApplicationConfirmationPage() {
  return (
    <main className="confirmation-page">
      <div className="site-shell confirmation-page__grid">
        <div className="confirmation-mark" aria-hidden="true"><span>✓</span></div>
        <div>
          <p className="eyebrow">Application received</p>
          <h1>Thank you for putting yourself forward.</h1>
          <p className="confirmation-page__lede">
            Your application has been stored securely. We will send a confirmation to
            the email address you provided; this confirms receipt, not an offer.
          </p>
          <div className="confirmation-next">
            <h2>What happens next</h2>
            <ol>
              <li><span>01</span><p>Our team reviews your application and CV.</p></li>
              <li><span>02</span><p>Shortlisted applicants are contacted using the email provided.</p></li>
              <li><span>03</span><p>You can continue exploring our research in the meantime.</p></li>
            </ol>
          </div>
          <Link className="button button--dark" href="/reports/strategic">Explore our reports <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </main>
  );
}
