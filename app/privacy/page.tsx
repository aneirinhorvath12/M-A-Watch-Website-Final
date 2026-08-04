import type { Metadata } from "next";
import Link from "next/link";
import { PolicyLayout } from "@/components/site/policy-layout";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How M&A Watch handles personal information submitted through this website.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PolicyLayout
      eyebrow="Policies"
      title="Privacy notice"
      updated="4 August 2026"
      introduction="This notice explains what information M&A Watch collects through this website, why we use it and the choices available to you."
      sections={[
        {
          title: "Who this notice is for",
          content: <><p>This notice applies to website visitors, applicants and people who contact M&amp;A Watch through the details published on this website.</p><p>M&amp;A Watch is responsible for deciding how personal information collected through the website is used. Final organisation and data-controller details will be confirmed before public launch.</p></>,
        },
        {
          title: "Information we collect",
          content: <><p>When you apply, we collect your name, university, email address, selected division, CV, privacy acknowledgement and submission time. We may also record limited technical information needed for security, fraud prevention and reliable operation.</p><p>If you contact us, we use the information in your message to respond. We do not ask applicants to create public accounts.</p></>,
        },
        {
          title: "How we use your information",
          content: <><p>Application information is used only to administer recruitment: receiving and reviewing submissions, contacting applicants, managing the selection process and maintaining an appropriate internal record.</p><p>We also process limited technical data to protect the website, prevent automated submissions, understand aggregate usage and investigate errors. We do not sell personal information.</p></>,
        },
        {
          title: "Storage, access and retention",
          content: <><p>CVs are stored privately and are not available through public links. Access is restricted to authorised M&amp;A Watch administrators who need it for recruitment.</p><p>The final applicant retention period and service-provider list will be added before recruitment goes live. Information will be removed or anonymised when it is no longer needed, subject to any legitimate record-keeping requirement.</p></>,
        },
        {
          title: "Your choices and rights",
          content: <><p>Depending on applicable law, you may ask us for a copy of your information, request a correction or deletion, restrict or object to processing, or withdraw consent where consent is the basis used.</p><p>To make a request, email <a href="mailto:privacy@mawatch.org">privacy@mawatch.org</a>. We may need to verify your identity before acting.</p></>,
        },
        {
          title: "Cookies and analytics",
          content: <><p>Our first-party analytics uses no cookies and loads no third-party tracking script. It keeps daily aggregate counts for approved events such as public page views, report and PDF use, publication searches or filters, application page views, successful submissions and broad validation-failure categories.</p><p>Analytics does not store IP addresses, user-agent strings, referrers, raw URLs or search text, visitor or applicant identifiers, CV details, or any name, university, email address or other form value. Aggregate counters are deleted after 400 days. If optional cookies or another analytics service is proposed later, this notice and any required consent controls must be updated before it is enabled.</p></>,
        },
        {
          title: "Contact and updates",
          content: <><p>Questions about this notice can be sent to <a href="mailto:privacy@mawatch.org">privacy@mawatch.org</a>. You can also review our <Link href="/terms">terms and content disclaimer</Link>.</p><p>We may update this notice as the organisation, recruitment process or service providers change. The date at the top shows the latest revision.</p></>,
        },
      ]}
    />
  );
}
