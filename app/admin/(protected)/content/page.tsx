import { ActionForm } from "@/components/admin/ActionForm";
import { PageHeader, StatusBadge, adminStyles as styles } from "@/components/admin/AdminUI";
import { database, safeJson } from "@/lib/platform";

export const dynamic = "force-dynamic";

type Entry = { key: string; draft_value: string; published_value: string; published_at: number | null };
type Value = { title?: string; body?: string; ctaLabel?: string; ctaHref?: string };

const SECTIONS = [
  { key: "homepage.hero", label: "Homepage hero", defaultTitle: "Student-led insight into the deals shaping tomorrow" },
  { key: "homepage.overview", label: "Homepage overview", defaultTitle: "About M&A Watch" },
  { key: "info.page", label: "Info page", defaultTitle: "About our work" },
  { key: "site.contact", label: "Contact and footer", defaultTitle: "Contact M&A Watch" },
] as const;

export default async function ContentPage() {
  const rows = await database().prepare("SELECT key, draft_value, published_value, published_at FROM content_entries").all<Entry>();
  const map = new Map(rows.results.map((row) => [row.key, row]));
  return (
    <>
      <PageHeader eyebrow="Website" title="Page content" description="Edit constrained page sections without changing the visual system. Save a draft for review, then publish explicitly when it is ready." />
      {SECTIONS.map((section) => {
        const row = map.get(section.key);
        const draft = safeJson<Value>(row?.draft_value, { title: section.defaultTitle, body: "Placeholder copy ready for the M&A Watch team to refine.", ctaLabel: "", ctaHref: "" });
        const published = safeJson<Value>(row?.published_value, {});
        return (
          <section className={styles.panel} key={section.key}>
            <div className={styles.panelHeader}><h2 className={styles.panelTitle}>{section.label}</h2><StatusBadge value={row?.published_at ? "Published" : "Draft only"} /></div>
            <div className={styles.panelBody}>
              <div className={styles.splitEditor}>
                <div>
                  <ActionForm action={`/api/admin/content/${section.key}`} method="PATCH" submitLabel="Save draft" buttonTone="secondary">
                    <input type="hidden" name="intent" value="save" />
                    <label className={styles.label}>Title</label><input className={styles.input} name="title" defaultValue={draft.title} required maxLength={180} />
                    <label className={styles.label} style={{ marginTop: "0.75rem" }}>Body</label><textarea className={styles.textarea} name="body" defaultValue={draft.body} maxLength={8000} />
                    <div className={styles.formGrid} style={{ marginTop: "0.75rem" }}>
                      <div className={styles.fieldHalf}><label className={styles.label}>Call-to-action label</label><input className={styles.input} name="ctaLabel" defaultValue={draft.ctaLabel} maxLength={80} /></div>
                      <div className={styles.fieldHalf}><label className={styles.label}>Call-to-action link</label><input className={styles.input} name="ctaHref" defaultValue={draft.ctaHref} /></div>
                    </div>
                  </ActionForm>
                  <ActionForm action={`/api/admin/content/${section.key}`} method="PATCH" submitLabel="Publish this section" confirmation={`Publish the current ${section.label} fields?`}>
                    <input type="hidden" name="intent" value="publish" /><input type="hidden" name="title" value={draft.title} /><input type="hidden" name="body" value={draft.body} /><input type="hidden" name="ctaLabel" value={draft.ctaLabel} /><input type="hidden" name="ctaHref" value={draft.ctaHref} />
                  </ActionForm>
                </div>
                <div>
                  <p className={styles.label}>Published preview</p>
                  <div className={styles.previewBox}><h2>{published.title || "Not published yet"}</h2><p>{published.body || "Save and publish this section when the placeholder or final copy is approved."}</p>{published.ctaLabel ? <p><span className={styles.buttonSecondary}>{published.ctaLabel}</span></p> : null}</div>
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
