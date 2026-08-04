"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type {
  BasicPageContent,
  HomepageEditorialContent,
  InfoContentBlock,
  InfoPageContent,
  ManagedContentKey,
  SiteContactContent,
} from "@/lib/site-content";
import styles from "./admin.module.css";

export type ManagedEditorEntry =
  | {
      key: "homepage.hero" | "homepage.overview";
      label: string;
      description: string;
      draft: BasicPageContent;
      publishedAt: number | null;
      previewHref: string;
    }
  | {
      key: "homepage.editorial";
      label: string;
      description: string;
      draft: HomepageEditorialContent;
      publishedAt: number | null;
      previewHref: string;
    }
  | {
      key: "info.page";
      label: string;
      description: string;
      draft: InfoPageContent;
      publishedAt: number | null;
      previewHref: string;
    }
  | {
      key: "site.contact";
      label: string;
      description: string;
      draft: SiteContactContent;
      publishedAt: number | null;
      previewHref: string;
    };

function InputField({
  label,
  value,
  onChange,
  maxLength,
  required = true,
  hint,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  required?: boolean;
  hint?: string;
  type?: "text" | "email" | "url";
}) {
  return (
    <label className={styles.label}>
      {label}
      <input
        className={styles.input}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        required={required}
      />
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <label className={styles.label}>
      {label}
      <textarea
        className={styles.textarea}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        required
      />
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}

function Card({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.contentCard}>
      <div className={styles.contentCardHeader}>
        <strong>{title}</strong>
        {actions ? <div className={styles.inlineActions}>{actions}</div> : null}
      </div>
      <div className={styles.contentCardBody}>{children}</div>
    </div>
  );
}

function BasicEditor({
  value,
  update,
}: {
  value: BasicPageContent;
  update: (value: BasicPageContent) => void;
}) {
  return (
    <div className={styles.contentFields}>
      <InputField label="Title" value={value.title} maxLength={180} onChange={(title) => update({ ...value, title })} />
      <TextField label="Body" value={value.body} maxLength={8000} onChange={(body) => update({ ...value, body })} />
      <div className={styles.formGrid}>
        <div className={styles.fieldHalf}>
          <InputField label="Call-to-action label" value={value.ctaLabel} maxLength={80} onChange={(ctaLabel) => update({ ...value, ctaLabel })} />
        </div>
        <div className={styles.fieldHalf}>
          <InputField label="Call-to-action link" value={value.ctaHref} maxLength={500} onChange={(ctaHref) => update({ ...value, ctaHref })} hint="Use a site path such as /info or a full HTTPS URL." />
        </div>
      </div>
    </div>
  );
}

function HomepageEditor({
  value,
  update,
}: {
  value: HomepageEditorialContent;
  update: (value: HomepageEditorialContent) => void;
}) {
  const setSeo = (seo: HomepageEditorialContent["seo"]) => update({ ...value, seo });
  const setHero = (hero: HomepageEditorialContent["hero"]) => update({ ...value, hero });
  const setPurpose = (purpose: HomepageEditorialContent["purpose"]) => update({ ...value, purpose });
  const setLatest = (latest: HomepageEditorialContent["latest"]) => update({ ...value, latest });
  const setResearch = (research: HomepageEditorialContent["research"]) => update({ ...value, research });
  const setImpact = (impact: HomepageEditorialContent["impact"]) => update({ ...value, impact });
  const setApplication = (application: HomepageEditorialContent["application"]) => update({ ...value, application });
  return (
    <div className={styles.contentFields}>
      <Card title="Search metadata">
        <div className={styles.contentFields}>
          <InputField label="Search and browser title" value={value.seo.title} maxLength={70} onChange={(title) => setSeo({ ...value.seo, title })} hint="The site adds “M&A Watch” automatically; keep this title specific and concise." />
          <TextField label="Search description" value={value.seo.description} maxLength={180} onChange={(description) => setSeo({ ...value.seo, description })} />
        </div>
      </Card>

      <Card title="Hero supporting copy">
        <div className={styles.contentFields}>
          <InputField label="Eyebrow" value={value.hero.eyebrow} maxLength={120} onChange={(eyebrow) => setHero({ ...value.hero, eyebrow })} />
          <div className={styles.formGrid}>
            <div className={styles.fieldHalf}><InputField label="Secondary link label" value={value.hero.secondaryCtaLabel} maxLength={100} onChange={(secondaryCtaLabel) => setHero({ ...value.hero, secondaryCtaLabel })} /></div>
            <div className={styles.fieldHalf}><InputField label="Secondary link" value={value.hero.secondaryCtaHref} maxLength={500} onChange={(secondaryCtaHref) => setHero({ ...value.hero, secondaryCtaHref })} /></div>
            <div className={styles.fieldWide}><InputField label="Discipline list accessibility label" value={value.hero.disciplinesAriaLabel} maxLength={100} onChange={(disciplinesAriaLabel) => setHero({ ...value.hero, disciplinesAriaLabel })} /></div>
          </div>
          <Card title="Research disciplines">
            <div className={styles.contentFields}>
              {value.hero.disciplines.map((discipline, index) => (
                <div className={styles.formGrid} key={`discipline-${index}`}>
                  <div className={styles.fieldHalf}><InputField label={`Discipline ${index + 1}`} value={discipline} maxLength={40} onChange={(next) => setHero({ ...value.hero, disciplines: replaceAt(value.hero.disciplines, index, next) })} /></div>
                  <div className={styles.fieldQuarter}><button className={styles.buttonDanger} type="button" disabled={value.hero.disciplines.length === 1} onClick={() => setHero({ ...value.hero, disciplines: value.hero.disciplines.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button></div>
                </div>
              ))}
              <button className={styles.buttonSecondary} type="button" disabled={value.hero.disciplines.length >= 8} onClick={() => setHero({ ...value.hero, disciplines: [...value.hero.disciplines, "New discipline"] })}>Add discipline</button>
            </div>
          </Card>
          <Card title="Featured research note">
            <div className={styles.formGrid}>
              <div className={styles.fieldHalf}><InputField label="Featured label" value={value.hero.featuredLabel} maxLength={80} onChange={(featuredLabel) => setHero({ ...value.hero, featuredLabel })} /></div>
              <div className={styles.fieldHalf}><InputField label="Empty desk label" value={value.hero.deskLabel} maxLength={80} onChange={(deskLabel) => setHero({ ...value.hero, deskLabel })} /></div>
              <div className={styles.fieldHalf}><InputField label="Awaiting publication label" value={value.hero.awaitingLabel} maxLength={80} onChange={(awaitingLabel) => setHero({ ...value.hero, awaitingLabel })} /></div>
              <div className={styles.fieldHalf}><InputField label="Read-publication link label" value={value.hero.readPublicationLabel} maxLength={100} onChange={(readPublicationLabel) => setHero({ ...value.hero, readPublicationLabel })} /></div>
              <div className={styles.fieldWide}><InputField label="Empty desk message" value={value.hero.emptyMessage} maxLength={240} onChange={(emptyMessage) => setHero({ ...value.hero, emptyMessage })} /></div>
              <div className={styles.fieldQuarter}><InputField label="Lens fact label" value={value.hero.lensLabel} maxLength={40} onChange={(lensLabel) => setHero({ ...value.hero, lensLabel })} /></div>
              <div className={styles.fieldQuarter}><InputField label="Published fact label" value={value.hero.publishedLabel} maxLength={40} onChange={(publishedLabel) => setHero({ ...value.hero, publishedLabel })} /></div>
              <div className={styles.fieldQuarter}><InputField label="Chapter fact label" value={value.hero.chapterLabel} maxLength={40} onChange={(chapterLabel) => setHero({ ...value.hero, chapterLabel })} /></div>
              <div className={styles.fieldQuarter}><InputField label="Default chapter value" value={value.hero.defaultChapter} maxLength={80} onChange={(defaultChapter) => setHero({ ...value.hero, defaultChapter })} /></div>
            </div>
          </Card>
          <Card title="Hero rule labels">
            <div className={styles.formGrid}>
              {value.hero.ruleLabels.map((label, index) => (
                <div className={styles.fieldQuarter} key={`hero-rule-${index}`}><InputField label={`Label ${index + 1}`} value={label} maxLength={40} onChange={(next) => setHero({ ...value.hero, ruleLabels: replaceAt(value.hero.ruleLabels, index, next) })} /></div>
              ))}
            </div>
          </Card>
        </div>
      </Card>

      <Card title="Purpose and latest-research labels">
        <div className={styles.contentFields}>
          <InputField label="Purpose section label" value={value.purpose.eyebrow} maxLength={80} onChange={(eyebrow) => setPurpose({ eyebrow })} />
          <div className={styles.formGrid}>
            <div className={styles.fieldHalf}><InputField label="Latest research section label" value={value.latest.eyebrow} maxLength={80} onChange={(eyebrow) => setLatest({ ...value.latest, eyebrow })} /></div>
            <div className={styles.fieldHalf}><InputField label="Latest research title" value={value.latest.title} maxLength={180} onChange={(title) => setLatest({ ...value.latest, title })} /></div>
            <div className={styles.fieldHalf}><InputField label="View-all link label" value={value.latest.ctaLabel} maxLength={100} onChange={(ctaLabel) => setLatest({ ...value.latest, ctaLabel })} /></div>
            <div className={styles.fieldHalf}><InputField label="View-all link" value={value.latest.ctaHref} maxLength={500} onChange={(ctaHref) => setLatest({ ...value.latest, ctaHref })} /></div>
            <div className={styles.fieldHalf}><InputField label="Publication edition prefix" value={value.latest.editionPrefix} maxLength={30} onChange={(editionPrefix) => setLatest({ ...value.latest, editionPrefix })} /></div>
            <div className={styles.fieldHalf}><InputField label="Default publication byline" value={value.latest.defaultByline} maxLength={100} onChange={(defaultByline) => setLatest({ ...value.latest, defaultByline })} /></div>
          </div>
        </div>
      </Card>

      <Card title="Research areas">
        <div className={styles.contentFields}>
          <InputField label="Section label" value={value.research.eyebrow} maxLength={80} onChange={(eyebrow) => setResearch({ ...value.research, eyebrow })} />
          <InputField label="Section title" value={value.research.title} maxLength={180} onChange={(title) => setResearch({ ...value.research, title })} />
          <TextField label="Section introduction" value={value.research.introduction} maxLength={1000} onChange={(introduction) => setResearch({ ...value.research, introduction })} />
          {value.research.areas.map((area, index) => (
            <Card
              title={`Research area ${index + 1}`}
              key={`research-area-${index}`}
              actions={
                <button
                  className={styles.buttonDanger}
                  type="button"
                  disabled={value.research.areas.length === 1}
                  onClick={() => setResearch({ ...value.research, areas: value.research.areas.filter((_, itemIndex) => itemIndex !== index) })}
                >
                  Remove
                </button>
              }
            >
              <div className={styles.formGrid}>
                <div className={styles.fieldQuarter}><InputField label="Number" value={area.number} maxLength={8} onChange={(number) => setResearch({ ...value.research, areas: replaceAt(value.research.areas, index, { ...area, number }) })} /></div>
                <div className={styles.fieldThird}><InputField label="Short label" value={area.label} maxLength={80} onChange={(label) => setResearch({ ...value.research, areas: replaceAt(value.research.areas, index, { ...area, label }) })} /></div>
                <div className={styles.fieldWide}><InputField label="Title" value={area.title} maxLength={120} onChange={(title) => setResearch({ ...value.research, areas: replaceAt(value.research.areas, index, { ...area, title }) })} /></div>
                <div className={styles.fieldWide}><TextField label="Description" value={area.body} maxLength={1000} onChange={(body) => setResearch({ ...value.research, areas: replaceAt(value.research.areas, index, { ...area, body }) })} /></div>
                <div className={styles.fieldHalf}><InputField label="Link label" value={area.linkLabel} maxLength={100} onChange={(linkLabel) => setResearch({ ...value.research, areas: replaceAt(value.research.areas, index, { ...area, linkLabel }) })} /></div>
                <div className={styles.fieldHalf}><InputField label="Link" value={area.href} maxLength={500} onChange={(href) => setResearch({ ...value.research, areas: replaceAt(value.research.areas, index, { ...area, href }) })} /></div>
              </div>
            </Card>
          ))}
          <button
            className={styles.buttonSecondary}
            type="button"
            disabled={value.research.areas.length >= 6}
            onClick={() => setResearch({
              ...value.research,
              areas: [...value.research.areas, { number: String(value.research.areas.length + 1).padStart(2, "0"), label: "New area", title: "New research area", body: "Add a short description.", href: "/reports/strategic", linkLabel: "Explore research" }],
            })}
          >
            Add research area
          </button>
        </div>
      </Card>

      <Card title="Impact and statistics">
        <div className={styles.contentFields}>
          <InputField label="Section label" value={value.impact.eyebrow} maxLength={80} onChange={(eyebrow) => setImpact({ ...value.impact, eyebrow })} />
          <InputField label="Section title" value={value.impact.title} maxLength={180} onChange={(title) => setImpact({ ...value.impact, title })} />
          <TextField label="Section body" value={value.impact.body} maxLength={1500} onChange={(body) => setImpact({ ...value.impact, body })} />
          <div className={styles.formGrid}>
            <div className={styles.fieldHalf}><InputField label="Link label" value={value.impact.ctaLabel} maxLength={100} onChange={(ctaLabel) => setImpact({ ...value.impact, ctaLabel })} /></div>
            <div className={styles.fieldHalf}><InputField label="Link" value={value.impact.ctaHref} maxLength={500} onChange={(ctaHref) => setImpact({ ...value.impact, ctaHref })} /></div>
          </div>
          {value.impact.stats.map((stat, index) => (
            <Card
              title={`Statistic ${index + 1}`}
              key={`impact-stat-${index}`}
              actions={<button className={styles.buttonDanger} type="button" disabled={value.impact.stats.length === 1} onClick={() => setImpact({ ...value.impact, stats: value.impact.stats.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>}
            >
              <div className={styles.formGrid}>
                <div className={styles.fieldThird}><InputField label="Value" value={stat.value} maxLength={24} onChange={(statValue) => setImpact({ ...value.impact, stats: replaceAt(value.impact.stats, index, { ...stat, value: statValue }) })} /></div>
                <div className={styles.fieldHalf}><InputField label="Label" value={stat.label} maxLength={80} onChange={(label) => setImpact({ ...value.impact, stats: replaceAt(value.impact.stats, index, { ...stat, label }) })} /></div>
              </div>
            </Card>
          ))}
          <button className={styles.buttonSecondary} type="button" disabled={value.impact.stats.length >= 8} onClick={() => setImpact({ ...value.impact, stats: [...value.impact.stats, { value: "0", label: "New statistic" }] })}>Add statistic</button>
        </div>
      </Card>

      <Card title="Application call to action">
        <div className={styles.contentFields}>
          <div className={styles.formGrid}>
            <div className={styles.fieldHalf}><InputField label="Open-state label" value={value.application.openEyebrow} maxLength={100} onChange={(openEyebrow) => setApplication({ ...value.application, openEyebrow })} /></div>
            <div className={styles.fieldHalf}><InputField label="Closed-state label" value={value.application.closedEyebrow} maxLength={100} onChange={(closedEyebrow) => setApplication({ ...value.application, closedEyebrow })} /></div>
            <div className={styles.fieldHalf}><InputField label="Open-state title" value={value.application.openTitle} maxLength={180} onChange={(openTitle) => setApplication({ ...value.application, openTitle })} /></div>
            <div className={styles.fieldHalf}><InputField label="Closed-state title" value={value.application.closedTitle} maxLength={180} onChange={(closedTitle) => setApplication({ ...value.application, closedTitle })} /></div>
            <div className={styles.fieldWide}><TextField label="Body" value={value.application.body} maxLength={1500} onChange={(body) => setApplication({ ...value.application, body })} /></div>
            <div className={styles.fieldHalf}><InputField label="Open-state button" value={value.application.openCtaLabel} maxLength={100} onChange={(openCtaLabel) => setApplication({ ...value.application, openCtaLabel })} /></div>
            <div className={styles.fieldHalf}><InputField label="Closed-state button" value={value.application.closedCtaLabel} maxLength={100} onChange={(closedCtaLabel) => setApplication({ ...value.application, closedCtaLabel })} /></div>
            <div className={styles.fieldWide}><InputField label="Button link" value={value.application.ctaHref} maxLength={500} onChange={(ctaHref) => setApplication({ ...value.application, ctaHref })} /></div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function blankInfoBlock(type: InfoContentBlock["type"]): InfoContentBlock {
  if (type === "heading") return { type, level: 2, text: "New heading" };
  if (type === "paragraph") return { type, text: "Add the paragraph text." };
  if (type === "image") return { type, src: "/og.png", alt: "Describe the purpose and content of this image", caption: "" };
  if (type === "link") return { type, label: "Explore more", href: "/" };
  return { type, eyebrow: "Next step", heading: "Add a call to action.", body: "Explain what the reader should do next.", primaryLabel: "Continue", primaryHref: "/", secondaryLabel: "", secondaryHref: "" };
}

function InfoBlockFields({ block, update }: { block: InfoContentBlock; update: (block: InfoContentBlock) => void }) {
  if (block.type === "heading") {
    return (
      <div className={styles.formGrid}>
        <div className={styles.fieldQuarter}>
          <label className={styles.label}>Heading level<select className={styles.select} value={block.level} onChange={(event) => update({ ...block, level: Number(event.target.value) as 2 | 3 })}><option value={2}>Heading 2</option><option value={3}>Heading 3</option></select></label>
        </div>
        <div className={styles.fieldWide}><InputField label="Heading text" value={block.text} maxLength={240} onChange={(text) => update({ ...block, text })} /></div>
      </div>
    );
  }
  if (block.type === "paragraph") return <TextField label="Paragraph" value={block.text} maxLength={4000} onChange={(text) => update({ ...block, text })} />;
  if (block.type === "image") {
    return (
      <div className={styles.contentFields}>
        <InputField label="Alternative text" value={block.alt} maxLength={300} onChange={(alt) => update({ ...block, alt })} hint="Required: describe the image's purpose for people who cannot see it." />
        <InfoImageUpload
          alt={block.alt}
          onUploaded={({ src, width, height }) => update({ ...block, src, width, height })}
        />
        <InputField label="Site image path" value={block.src} maxLength={500} onChange={(src) => update({ ...block, src, width: undefined, height: undefined })} hint="The uploader fills this automatically. Advanced users may use an existing same-site PNG, JPEG, WebP or AVIF path." />
        {block.width && block.height ? <p className={styles.hint}>Verified dimensions: {block.width} × {block.height}px.</p> : null}
        <InputField label="Caption (optional)" value={block.caption} maxLength={500} required={false} onChange={(caption) => update({ ...block, caption })} />
      </div>
    );
  }
  if (block.type === "link") {
    return (
      <div className={styles.formGrid}>
        <div className={styles.fieldHalf}><InputField label="Link label" value={block.label} maxLength={120} onChange={(label) => update({ ...block, label })} /></div>
        <div className={styles.fieldHalf}><InputField label="Link" value={block.href} maxLength={500} onChange={(href) => update({ ...block, href })} /></div>
      </div>
    );
  }
  return (
    <div className={styles.formGrid}>
      <div className={styles.fieldHalf}><InputField label="Eyebrow (optional)" value={block.eyebrow} maxLength={100} required={false} onChange={(eyebrow) => update({ ...block, eyebrow })} /></div>
      <div className={styles.fieldWide}><InputField label="Heading" value={block.heading} maxLength={180} onChange={(heading) => update({ ...block, heading })} /></div>
      <div className={styles.fieldWide}><TextField label="Body" value={block.body} maxLength={1500} onChange={(body) => update({ ...block, body })} /></div>
      <div className={styles.fieldHalf}><InputField label="Primary button label" value={block.primaryLabel} maxLength={100} onChange={(primaryLabel) => update({ ...block, primaryLabel })} /></div>
      <div className={styles.fieldHalf}><InputField label="Primary button link" value={block.primaryHref} maxLength={500} onChange={(primaryHref) => update({ ...block, primaryHref })} /></div>
      <div className={styles.fieldHalf}><InputField label="Secondary link label (optional)" value={block.secondaryLabel} maxLength={100} required={false} onChange={(secondaryLabel) => update({ ...block, secondaryLabel })} /></div>
      <div className={styles.fieldHalf}><InputField label="Secondary link (optional)" value={block.secondaryHref} maxLength={500} required={false} onChange={(secondaryHref) => update({ ...block, secondaryHref })} /></div>
    </div>
  );
}

function InfoImageUpload({
  alt,
  onUploaded,
}: {
  alt: string;
  onUploaded(value: { src: string; width: number; height: number }): void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function upload() {
    if (!file || pending) return;
    if (!alt.trim()) {
      setMessage("Add meaningful alternative text before uploading.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const body = new FormData();
      body.set("image", file);
      body.set("alt", alt);
      const response = await fetch("/api/admin/content/info/assets", {
        method: "POST",
        headers: { Accept: "application/json" },
        body,
      });
      const result = await response.json().catch(() => ({})) as {
        error?: string;
        message?: string;
        src?: string;
        width?: number;
        height?: number;
      };
      if (!response.ok || !result.src || !result.width || !result.height) {
        throw new Error(result.error || "The image could not be uploaded.");
      }
      onUploaded({ src: result.src, width: result.width, height: result.height });
      setFile(null);
      setMessage(result.message || "Image uploaded.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The image could not be uploaded.");
    } finally {
      setPending(false);
    }
  }

  return (
    <fieldset className={styles.imageUpload}>
      <legend>Upload or replace managed image</legend>
      <input
        className={styles.input}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <button className={styles.buttonSecondary} type="button" disabled={!file || pending} onClick={() => void upload()}>
        {pending ? "Uploading…" : "Upload selected image"}
      </button>
      <span className={styles.hint} role="status">{message || "JPEG, PNG or WebP; maximum 5 MB. Dimensions are verified on the server."}</span>
    </fieldset>
  );
}

function InfoEditor({ value, update }: { value: InfoPageContent; update: (value: InfoPageContent) => void }) {
  const [newType, setNewType] = useState<InfoContentBlock["type"]>("paragraph");
  return (
    <div className={styles.contentFields}>
      <Card title="Search metadata">
        <div className={styles.contentFields}>
          <InputField label="Search and browser title" value={value.seo.title} maxLength={70} onChange={(title) => update({ ...value, seo: { ...value.seo, title } })} hint="The site adds “M&A Watch” automatically; keep this title specific and concise." />
          <TextField label="Search description" value={value.seo.description} maxLength={180} onChange={(description) => update({ ...value, seo: { ...value.seo, description } })} />
        </div>
      </Card>
      <Card title="Page introduction">
        <div className={styles.contentFields}>
          <InputField label="Eyebrow" value={value.eyebrow} maxLength={100} onChange={(eyebrow) => update({ ...value, eyebrow })} />
          <InputField label="Page title" value={value.title} maxLength={180} onChange={(title) => update({ ...value, title })} />
          <TextField label="Introduction" value={value.introduction} maxLength={2000} onChange={(introduction) => update({ ...value, introduction })} />
        </div>
      </Card>
      <div className={styles.addBlockBar}>
        <label className={styles.label}>Add a content block</label>
        <select className={styles.select} value={newType} onChange={(event) => setNewType(event.target.value as InfoContentBlock["type"])}>
          <option value="heading">Heading</option><option value="paragraph">Paragraph</option><option value="image">Image</option><option value="link">Link</option><option value="cta">Call to action</option>
        </select>
        <button className={styles.buttonSecondary} type="button" disabled={value.blocks.length >= 18} onClick={() => update({ ...value, blocks: [...value.blocks, blankInfoBlock(newType)] })}>Add block</button>
        <span className={styles.hint}>{value.blocks.length} of 18 blocks used.</span>
      </div>
      {value.blocks.map((block, index) => (
        <Card
          title={`${index + 1}. ${block.type === "cta" ? "Call to action" : block.type[0].toUpperCase() + block.type.slice(1)}`}
          key={`${index}-${block.type}`}
          actions={
            <>
              <button className={styles.buttonQuiet} type="button" disabled={index === 0} onClick={() => update({ ...value, blocks: move(value.blocks, index, index - 1) })}>Move up</button>
              <button className={styles.buttonQuiet} type="button" disabled={index === value.blocks.length - 1} onClick={() => update({ ...value, blocks: move(value.blocks, index, index + 1) })}>Move down</button>
              <button className={styles.buttonDanger} type="button" disabled={value.blocks.length === 1} onClick={() => update({ ...value, blocks: value.blocks.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>
            </>
          }
        >
          <InfoBlockFields block={block} update={(next) => update({ ...value, blocks: replaceAt(value.blocks, index, next) })} />
        </Card>
      ))}
    </div>
  );
}

function ContactEditor({ value, update }: { value: SiteContactContent; update: (value: SiteContactContent) => void }) {
  return (
    <div className={styles.contentFields}>
      <TextField label="Footer description" value={value.body} maxLength={1000} onChange={(body) => update({ ...value, body })} />
      <div className={styles.formGrid}>
        <div className={styles.fieldHalf}><InputField label="Contact email" type="email" value={value.email} maxLength={254} onChange={(email) => update({ ...value, email })} /></div>
        <div className={styles.fieldHalf}><InputField label="Visible email label" value={value.emailLabel} maxLength={100} onChange={(emailLabel) => update({ ...value, emailLabel })} /></div>
      </div>
      <Card title="Social channels">
        <div className={styles.contentFields}>
          {value.socialLinks.length ? value.socialLinks.map((social, index) => (
            <Card title={`Social link ${index + 1}`} key={`social-link-${index}`} actions={<button className={styles.buttonDanger} type="button" onClick={() => update({ ...value, socialLinks: value.socialLinks.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>}>
              <div className={styles.formGrid}>
                <div className={styles.fieldHalf}><InputField label="Label" value={social.label} maxLength={60} onChange={(label) => update({ ...value, socialLinks: replaceAt(value.socialLinks, index, { ...social, label }) })} /></div>
                <div className={styles.fieldHalf}><InputField label="HTTPS URL" type="url" value={social.href} maxLength={500} onChange={(href) => update({ ...value, socialLinks: replaceAt(value.socialLinks, index, { ...social, href }) })} /></div>
              </div>
            </Card>
          )) : <p className={styles.hint}>No social links are currently shown.</p>}
          <button className={styles.buttonSecondary} type="button" disabled={value.socialLinks.length >= 6} onClick={() => update({ ...value, socialLinks: [...value.socialLinks, { label: "LinkedIn", href: "https://www.linkedin.com/" }] })}>Add social link</button>
        </div>
      </Card>
    </div>
  );
}

function ContentEditor({ entry }: { entry: ManagedEditorEntry }) {
  const router = useRouter();
  const [value, setValue] = useState(entry.draft);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<"save" | "publish" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update(next: typeof value) {
    setValue(next);
    setDirty(true);
    setMessage("");
    setError("");
  }

  async function submit(intent: "save" | "publish") {
    if (pending) return;
    if (intent === "publish" && !window.confirm(`Publish the saved ${entry.label.toLowerCase()} draft?`)) return;
    setPending(intent);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/admin/content/${entry.key}`, {
        method: "PATCH",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(intent === "save" ? { intent, value } : { intent }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "The change could not be saved.");
      if (intent === "save") setDirty(false);
      setMessage(result.message || (intent === "save" ? "Draft saved." : "Content published."));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The change could not be saved.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>{entry.label}</h2>
          <p className={styles.panelDescription}>{entry.description}</p>
        </div>
        <span className={`${styles.status} ${entry.publishedAt ? styles.statusGood : styles.statusWarning}`}>
          {entry.publishedAt ? "Published version exists; draft may differ" : "No published version"}
        </span>
      </div>
      <div className={styles.panelBody}>
        {entry.key === "homepage.hero" || entry.key === "homepage.overview" ? (
          <BasicEditor value={value as BasicPageContent} update={(next) => update(next)} />
        ) : entry.key === "homepage.editorial" ? (
          <HomepageEditor value={value as HomepageEditorialContent} update={(next) => update(next)} />
        ) : entry.key === "info.page" ? (
          <InfoEditor value={value as InfoPageContent} update={(next) => update(next)} />
        ) : (
          <ContactEditor value={value as SiteContactContent} update={(next) => update(next)} />
        )}
        <div className={styles.contentActions}>
          <button className={styles.buttonSecondary} type="button" disabled={Boolean(pending)} onClick={() => void submit("save")}>{pending === "save" ? "Saving…" : "Save draft"}</button>
          <Link className={styles.buttonSecondary} href={entry.previewHref} target="_blank">Preview saved draft</Link>
          <button className={styles.button} type="button" disabled={Boolean(pending) || dirty} onClick={() => void submit("publish")}>{pending === "publish" ? "Publishing…" : "Publish saved draft"}</button>
          {dirty ? <span className={styles.hint}>Save your changes before previewing or publishing them.</span> : null}
        </div>
        <div className={`${styles.formStatus} ${error ? styles.formStatusError : ""}`} role="status" aria-live="polite">{error || message}</div>
      </div>
    </section>
  );
}

export function ManagedContentEditor({ entries }: { entries: ManagedEditorEntry[] }) {
  return <>{entries.map((entry) => <ContentEditor entry={entry} key={entry.key} />)}</>;
}

function replaceAt<T>(items: T[], index: number, value: T): T[] {
  return items.map((item, itemIndex) => itemIndex === index ? value : item);
}

function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function previewHrefForContentKey(key: ManagedContentKey): string {
  if (key.startsWith("homepage.")) return "/preview/content/homepage";
  if (key === "info.page") return "/preview/content/info";
  return "/preview/content/footer";
}
