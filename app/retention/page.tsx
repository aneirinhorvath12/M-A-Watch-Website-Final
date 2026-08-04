import type { Metadata } from "next";
import Link from "next/link";
import { PolicyLayout } from "@/components/site/policy-layout";
import {
  APPLICANT_RETENTION_DAYS,
  CURRENT_APPLICATION_PRIVACY_VERSION,
} from "@/lib/data-policy";
import { getPublishedSiteContact } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "Recruitment data retention policy",
  description:
    "How long M&A Watch keeps applicant information and how automatic deletion is enforced.",
  alternates: { canonical: "/retention" },
};

export default async function RetentionPage() {
  const contact = await getPublishedSiteContact();
  return (
    <PolicyLayout
      eyebrow="Policies"
      title="Recruitment data retention policy"
      updated={`5 August 2026 · version ${CURRENT_APPLICATION_PRIVACY_VERSION}`}
      introduction={`M&A Watch makes applicant information available for recruitment for up to ${APPLICANT_RETENTION_DAYS} days from submission. It becomes inaccessible at that deadline and is permanently removed by the next successful maintenance cycle, or earlier where an approved deletion request applies.`}
      sections={[
        {
          title: "Records covered",
          content: <><p>This policy covers an applicant&apos;s name, university, email address, selected division, CV, internal recruitment notes and status history. It also covers queued transactional emails containing applicant information.</p><p>It does not cover anonymous aggregate analytics, which contains no applicant identifiers or application values.</p></>,
        },
        {
          title: "Retention period",
          content: <><p>Each accepted submission receives a fixed deletion deadline of {APPLICANT_RETENTION_DAYS} days after its submission time. Changing the policy later does not silently extend an existing applicant&apos;s deadline.</p><p>An authorised Super User can queue earlier deletion following a verified privacy request or another approved administrative reason. Recruitment decisions do not by themselves extend the deadline.</p></>,
        },
        {
          title: "Automatic enforcement",
          content: <><p>Every applicant read and write checks the retention deadline. As soon as it is reached, the record is hidden from lists and detail pages and cannot be read, edited, exported or downloaded, even if scheduled maintenance is delayed.</p><p>A scheduled maintenance process then removes the private CV first and permanently deletes the applicant record, notes, status history and related queued messages. The deletion is designed to be safely retried after a temporary outage. Monitoring must alert the site owner if scheduled maintenance stops or a deletion fails. Application intake remains a launch-controlled feature until the retention policy and its operational scheduler have been approved and configured.</p></>,
        },
        {
          title: "Evidence and backups",
          content: <><p>Permanent deletion removes the applicant record, CV, notes, status history, applicant-linked audit events and related background jobs. Operational monitoring retains only aggregate counts of maintenance successes, failures and queued work; those counts contain no applicant identifier.</p><p>Any restricted backup containing applicant information must follow the same retention boundary. Expired applicant information must not be restored into the active service; restoration procedures must reapply deletion deadlines before access is enabled.</p></>,
        },
        {
          title: "Requests and questions",
          content: <><p>To request access, correction or early deletion, contact <a href={`mailto:${contact.email}`}>{contact.email}</a>. We may ask for enough information to verify that the requester is the applicant.</p><p>For how and why information is processed, read the <Link href="/privacy">privacy notice</Link>.</p></>,
        },
      ]}
    />
  );
}
