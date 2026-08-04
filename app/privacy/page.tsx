import type { Metadata } from "next";
import Link from "next/link";
import { PolicyLayout } from "@/components/site/policy-layout";
import {
  APPLICANT_RETENTION_DAYS,
  CURRENT_APPLICATION_PRIVACY_VERSION,
} from "@/lib/data-policy";
import { ANALYTICS_RETENTION_DAYS } from "@/lib/analytics-policy";
import { getPublishedSiteContact } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How M&A Watch handles personal information submitted through this website.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  const contact = await getPublishedSiteContact();
  return (
    <PolicyLayout
      eyebrow="Policies"
      title="Privacy notice"
      updated={`5 August 2026 · version ${CURRENT_APPLICATION_PRIVACY_VERSION}`}
      introduction="This notice explains what information M&A Watch collects through this website, why we use it and the choices available to you."
      sections={[
        {
          title: "Who this notice is for",
          content: <><p>This notice applies to website visitors, applicants and people who contact M&amp;A Watch through this website.</p><p>M&amp;A Watch, a student-led finance and law society, decides how personal information collected through the website is used. Privacy questions and rights requests can be sent to <a href={`mailto:${contact.email}`}>{contact.email}</a>.</p></>,
        },
        {
          title: "Information we collect",
          content: <><p>When you apply, we collect your name, university, email address, selected division, CV, privacy acknowledgement and submission time. We may also record limited technical information needed for security, fraud prevention and reliable operation.</p><p>If you contact us, we use the information in your message to respond. We do not ask applicants to create public accounts.</p></>,
        },
        {
          title: "How we use your information",
          content: <><p>Application information is used only to administer recruitment: receiving and reviewing submissions, contacting applicants, managing the selection process and maintaining an appropriate internal record. Applicants must acknowledge this notice before submitting.</p><p>We also process limited technical data where necessary to protect the website, prevent automated submissions, understand aggregate usage and investigate errors. We do not sell personal information or use applicant information for advertising.</p></>,
        },
        {
          title: "Storage, access and retention",
          content: <><p>CVs are quarantined until malware scanning succeeds, stored privately and never made available through a public link. Access is restricted to authorised M&amp;A Watch administrators who need it for recruitment, and access is audited.</p><p>Applicant records, CVs, internal notes and status history are available for recruitment for up to {APPLICANT_RETENTION_DAYS} days from submission, unless deletion is approved earlier. At the deadline the record immediately becomes inaccessible and it is permanently removed by the next successful maintenance cycle; a temporary outage delays physical removal but never restores access. Permanent deletion also removes applicant-linked audit history and background jobs. Operational monitoring retains only aggregate maintenance counts without an applicant identifier. Read the <Link href="/retention">recruitment data retention policy</Link> for the full process.</p></>,
        },
        {
          title: "Service providers and international processing",
          content: <><p>We use service providers to host the website and private files, send transactional email, scan uploaded files for malware and, where applicable, monitor service operation. They receive only the information needed to provide that service and must be configured before application intake opens.</p><p>Some providers may process information outside the United Kingdom. Where this happens, M&amp;A Watch will use the contractual and organisational safeguards required for the selected provider and can provide current provider details on request.</p></>,
        },
        {
          title: "Your choices and rights",
          content: <><p>Depending on applicable law, you may ask us for a copy of your information, request a correction or deletion, restrict or object to processing, or withdraw consent where consent is the basis used. Withdrawing consent does not affect processing that occurred before withdrawal.</p><p>To make a request, email <a href={`mailto:${contact.email}`}>{contact.email}</a>. We may need to verify your identity before acting. You may also have the right to complain to the UK Information Commissioner&apos;s Office.</p></>,
        },
        {
          title: "Cookies and analytics",
          content: <><p>Our first-party analytics uses no cookies and loads no third-party tracking script. It keeps daily aggregate counts for approved events such as public page views, report and PDF use, publication searches or filters, application page views, successful submissions and broad validation-failure categories.</p><p>Analytics does not store IP addresses, user-agent strings, referrers, raw URLs or search text, visitor or applicant identifiers, CV details, or any name, university, email address or other form value. Aggregate counters are deleted after {ANALYTICS_RETENTION_DAYS} days. If optional cookies or another analytics service is proposed later, this notice and any required consent controls must be updated before it is enabled.</p></>,
        },
        {
          title: "Contact and updates",
          content: <><p>Questions about this notice can be sent to <a href={`mailto:${contact.email}`}>{contact.email}</a>. You can also review our <Link href="/retention">retention policy</Link> and <Link href="/terms">terms and content disclaimer</Link>.</p><p>We may update this notice as the organisation, recruitment process or service providers change. The date and version at the top identify the notice acknowledged with an application.</p></>,
        },
      ]}
    />
  );
}
