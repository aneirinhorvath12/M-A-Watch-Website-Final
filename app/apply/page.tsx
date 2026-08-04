import type { Metadata } from "next";
import { ApplicationForm } from "@/components/site/application-form";
import { PageIntro } from "@/components/site/page-intro";
import { getPublicApplicationSettings } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Apply",
  description:
    "Apply to join M&A Watch in Law, Finance or Markets and contribute to student-led deal intelligence.",
  alternates: { canonical: "/apply" },
};

export default async function ApplyPage() {
  const settings = await getPublicApplicationSettings();
  return (
    <main className="apply-page">
      <PageIntro
        eyebrow="Applications / 2026"
        title="Your perspective belongs in the room."
        tone="dark"
        aside={<span className="status-pill"><span aria-hidden="true" /> {settings.open ? "Applications open" : "Applications closed"}</span>}
      >
        <p>{settings.introduction}</p>
      </PageIntro>

      <section className="apply-overview section-pad">
        <div className="site-shell apply-overview__grid">
          <div className="apply-overview__aside">
            <p className="section-index">Before you begin</p>
            <h2>One application. Three divisions.</h2>
            <p>
              Choose the area that best matches your interests. We are looking for
              curiosity, clear thinking and a willingness to improve - not prior deal experience.
            </p>
            <dl>
              <div><dt>Time</dt><dd>About 5 minutes</dd></div>
              <div><dt>You will need</dt><dd>A PDF copy of your CV</dd></div>
              <div><dt>File limit</dt><dd>10 MB</dd></div>
            </dl>
          </div>
          <div className="apply-overview__form">
            {settings.open ? (
              <ApplicationForm />
            ) : (
              <div className="application-form" role="status">
                <div className="form-section-heading">
                  <span aria-hidden="true">—</span>
                  <div><h2>Applications are closed</h2><p>{settings.closedMessage}</p></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
