import styles from "./publications.module.css";
import type { PublicationType } from "@/lib/publications";

export function PdfActions({
  pdfUrl,
  filename,
  publicationType,
  compact = false,
}: {
  pdfUrl: string;
  filename: string;
  publicationType: PublicationType;
  compact?: boolean;
}) {
  return (
    <div className={compact ? styles.pdfActionsCompact : styles.pdfActions}>
      <a
        className={styles.primaryPdfAction}
        data-analytics-event="report_pdf_view"
        data-analytics-value={publicationType}
        href={pdfUrl}
        rel="noreferrer"
        target="_blank"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
        </svg>
        Open PDF
      </a>
      <a
        className={styles.secondaryPdfAction}
        data-analytics-event="report_pdf_download"
        data-analytics-value={publicationType}
        download={filename}
        href={pdfUrl}
      >
        Download
      </a>
    </div>
  );
}
