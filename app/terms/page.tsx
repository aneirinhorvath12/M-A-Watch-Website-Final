import type { Metadata } from "next";
import Link from "next/link";
import { PolicyLayout } from "@/components/site/policy-layout";

export const metadata: Metadata = {
  title: "Terms and content disclaimer",
  description: "Terms for using M&A Watch publications and website content.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PolicyLayout
      eyebrow="Policies"
      title="Terms & content disclaimer"
      updated="4 August 2026"
      introduction="These terms explain the basis on which M&A Watch makes its student research and website available."
      sections={[
        {
          title: "Educational content only",
          content: <><p>M&amp;A Watch publications are student-led educational research. They are intended to encourage learning and discussion and do not constitute investment, financial, legal, tax or other professional advice.</p><p>Do not make a transaction, investment or legal decision solely on the basis of this website. Seek appropriately qualified advice for your circumstances.</p></>,
        },
        {
          title: "Accuracy and availability",
          content: <><p>We aim to present sources and analysis carefully, but student publications may contain errors, omissions or opinions with which others disagree. Information may become outdated after publication.</p><p>We do not promise that the website or any particular publication will always be available, complete or free from interruption. Archived or corrected material may be changed or withdrawn.</p></>,
        },
        {
          title: "Intellectual property",
          content: <><p>Unless a publication states otherwise, M&amp;A Watch or the named authors retain rights in original website content and reports. Third-party names, marks, quotations, images and source materials remain the property of their respective owners.</p><p>You may link to public pages and quote short extracts with clear attribution for non-commercial educational use. Contact us before reproducing a full report or using material commercially.</p></>,
        },
        {
          title: "Acceptable use",
          content: <><p>Do not misuse the website, interfere with its security, attempt unauthorised access, submit malicious files, scrape private areas or use the application form for anything other than a genuine application.</p><p>Automated access must respect published technical controls and must not materially impair the service.</p></>,
        },
        {
          title: "External links",
          content: <><p>Reports may link to company announcements, regulators, news sources and other external websites. Those services are controlled by third parties; a link does not mean that M&amp;A Watch endorses every view or accepts responsibility for their content.</p></>,
        },
        {
          title: "Changes and contact",
          content: <><p>We may revise these terms as the website develops. Continued use after a revision means the current terms apply to that use.</p><p>Questions can be sent to <a href="mailto:hello@mawatch.org">hello@mawatch.org</a>. Personal-information questions are covered by our <Link href="/privacy">privacy notice</Link>.</p></>,
        },
      ]}
    />
  );
}
