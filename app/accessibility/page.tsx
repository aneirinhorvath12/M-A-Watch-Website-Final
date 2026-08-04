import type { Metadata } from "next";
import Link from "next/link";
import { PolicyLayout } from "@/components/site/policy-layout";

export const metadata: Metadata = {
  title: "Accessibility statement",
  description: "M&A Watch's commitment to an accessible website and publications.",
  alternates: { canonical: "/accessibility" },
};

export default function AccessibilityPage() {
  return (
    <PolicyLayout
      eyebrow="Policies"
      title="Accessibility statement"
      updated="4 August 2026"
      introduction="We want everyone to be able to explore our research, understand M&A Watch and apply to join the organisation."
      sections={[
        {
          title: "Our commitment",
          content: <><p>We are designing the public and administrative website with WCAG 2.2 Level AA as our target. Accessibility is considered in navigation, forms, colour contrast, document structure and publication workflows.</p><p>This statement covers the M&amp;A Watch website. Linked third-party services and original PDF source documents may have different levels of accessibility.</p></>,
        },
        {
          title: "Using this website",
          content: <><p>You should be able to navigate using a keyboard, zoom content without horizontal scrolling at common viewport sizes, use visible focus indicators, understand headings and labels, and receive clear form validation.</p><p>Motion is reduced when your device requests it. Meaningful images require alternative text, and report tables are presented in a scrollable, labelled region on smaller screens.</p></>,
        },
        {
          title: "Publication formats",
          content: <><p>Strategic and Legal reports are published as structured web articles after editorial review, alongside their original PDFs. This provides an accessible reading option while preserving the source document.</p><p>Markets newsletters are currently PDF-led. Each newsletter page offers a clear open or download action and a fallback when inline viewing is unavailable.</p></>,
        },
        {
          title: "Known limitations",
          content: <><p>Some historic or third-party PDF material may not have a fully reliable reading order, complete alternative text or accessible complex graphics. Representative reports are being reviewed as the publishing workflow is completed.</p><p>Placeholder team content and legal details will be replaced before launch. We will update this statement after a formal pre-launch accessibility review.</p></>,
        },
        {
          title: "Feedback and alternative formats",
          content: <><p>If something is difficult to use, or if you need a publication in another format, email <a href="mailto:accessibility@mawatch.org">accessibility@mawatch.org</a>. Please tell us the page or document and the format that would help.</p><p>We aim to acknowledge accessibility feedback promptly. You can also review how we handle personal information in our <Link href="/privacy">privacy notice</Link>.</p></>,
        },
      ]}
    />
  );
}
