"use client";

import { useRef } from "react";
import { PdfActions } from "./PdfActions";
import type { PublicationType } from "@/lib/publications";
import { claimEmbeddedPdfView } from "@/lib/analytics-policy";
import { trackAnalytics } from "@/components/site/analytics-tracker";
import styles from "./publications.module.css";

export function PdfViewer({
  title,
  pdfUrl,
  filename,
  publicationType,
}: {
  title: string;
  pdfUrl: string;
  filename: string;
  publicationType: PublicationType;
}) {
  const claimedLoads = useRef(new Set<string>());

  function trackEmbeddedLoad() {
    const event = claimEmbeddedPdfView(
      claimedLoads.current,
      publicationType,
      pdfUrl,
    );
    if (event) trackAnalytics(event);
  }

  return (
    <section className={styles.pdfViewerSection} aria-labelledby="pdf-viewer-title">
      <div className={styles.pdfViewerHeader}>
        <div>
          <p className={styles.eyebrow}>Original issue</p>
          <h2 id="pdf-viewer-title">Read the PDF</h2>
        </div>
        <PdfActions compact filename={filename} pdfUrl={pdfUrl} publicationType={publicationType} />
      </div>
      <div className={styles.pdfViewerFrame}>
        <object
          aria-label={`${title} PDF`}
          data={`${pdfUrl}#view=FitH`}
          data-analytics-pdf-viewer={publicationType}
          onLoad={trackEmbeddedLoad}
          type="application/pdf"
        >
          <div className={styles.pdfFallback}>
            <span aria-hidden="true">PDF</span>
            <h3>Your browser cannot show this PDF inline</h3>
            <p>You can still open it in a new tab or download a copy to your device.</p>
            <PdfActions filename={filename} pdfUrl={pdfUrl} publicationType={publicationType} />
          </div>
        </object>
      </div>
      <p className={styles.viewerHelp}>
        If the embedded reader is difficult to use with assistive technology, download the
        original file or contact M&amp;A Watch for an accessible version.
      </p>
    </section>
  );
}
