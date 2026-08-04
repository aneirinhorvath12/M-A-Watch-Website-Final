import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { PageHeader, adminStyles as styles } from "@/components/admin/AdminUI";

export const dynamic = "force-dynamic";

export default function NewPublicationPage() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        eyebrow="Publishing"
        title="New publication"
        description="Upload the original PDF and create an editorial record. Strategic and Legal sources enter the parser queue; Markets remains PDF-only. Nothing is published automatically."
        actions={<Link className={styles.buttonSecondary} href="/admin/publications">Cancel</Link>}
      />
      <div className={styles.noticeWarning}>
        Uploads receive built-in PDF checks, then remain quarantined while the external malware-scanning integration is pending. This queue state is visible on the review screen.
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHeader}><h2 className={styles.panelTitle}>Publication details</h2><span className={styles.panelMeta}>Required fields are labelled</span></div>
        <div className={styles.panelBody}>
          <ActionForm action="/api/admin/publications" mode="form-data" submitLabel="Create publication" pendingLabel="Uploading…">
            <div className={styles.formGrid}>
              <div className={styles.fieldThird}>
                <label className={styles.label} htmlFor="type">Type *</label>
                <select className={styles.select} id="type" name="type" required defaultValue="strategic">
                  <option value="strategic">Strategic Deal Report</option><option value="legal">Legal Report</option><option value="markets">Markets newsletter</option>
                </select>
              </div>
              <div className={styles.fieldThird}>
                <label className={styles.label} htmlFor="publicationDate">Publication date *</label>
                <input className={styles.input} id="publicationDate" name="publicationDate" type="date" defaultValue={today} required />
              </div>
              <div className={styles.fieldThird}>
                <label className={styles.label} htmlFor="sourcePdf">Original PDF *</label>
                <input className={styles.input} id="sourcePdf" name="sourcePdf" type="file" accept="application/pdf,.pdf" required />
                <span className={styles.hint}>PDF only, up to 30 MB.</span>
              </div>
              <div className={styles.fieldHalf}>
                <label className={styles.label} htmlFor="title">Title *</label>
                <input className={styles.input} id="title" name="title" required maxLength={220} />
              </div>
              <div className={styles.fieldHalf}>
                <label className={styles.label} htmlFor="slug">URL slug</label>
                <input className={styles.input} id="slug" name="slug" maxLength={120} placeholder="Generated from title when blank" />
              </div>
              <div className={styles.fieldWide}>
                <label className={styles.label} htmlFor="summary">Summary</label>
                <textarea className={styles.textarea} id="summary" name="summary" maxLength={1200} />
              </div>
              <div className={styles.fieldHalf}>
                <label className={styles.label} htmlFor="authors">Authors</label>
                <input className={styles.input} id="authors" name="authors" placeholder="Separate names with commas" />
              </div>
              <div className={styles.fieldHalf}>
                <label className={styles.label} htmlFor="chapter">Chapter or team</label>
                <input className={styles.input} id="chapter" name="chapter" maxLength={180} />
              </div>
              <div className={styles.fieldWide}>
                <label className={styles.checkboxRow}><input type="checkbox" name="featured" /> Mark as featured when published</label>
              </div>
            </div>
          </ActionForm>
        </div>
      </section>
    </>
  );
}
