import styles from "./publications.module.css";

export function PdfActions({
  pdfUrl,
  filename,
  compact = false,
}: {
  pdfUrl: string;
  filename: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? styles.pdfActionsCompact : styles.pdfActions}>
      <a className={styles.primaryPdfAction} href={pdfUrl} rel="noreferrer" target="_blank">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
        </svg>
        Open PDF
      </a>
      <a className={styles.secondaryPdfAction} download={filename} href={pdfUrl}>
        Download
      </a>
    </div>
  );
}
