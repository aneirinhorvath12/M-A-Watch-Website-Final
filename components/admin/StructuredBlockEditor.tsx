"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ArticleBlock,
  InlineText,
  ReferenceEntry,
} from "@/lib/publications/types";
import { PublicationBodyPreview } from "./PublicationBodyPreview";
import styles from "./admin.module.css";

type BlockType = ArticleBlock["type"];

const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  list: "List",
  quote: "Quote",
  image: "Image",
  table: "Table",
  references: "References",
  divider: "Divider",
};

function parseBlocks(value: string): ArticleBlock[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as ArticleBlock[]) : [];
  } catch {
    return [];
  }
}

function newId(type: BlockType): string {
  return `${type}-${crypto.randomUUID()}`;
}

function createBlock(type: BlockType): ArticleBlock {
  const id = newId(type);
  switch (type) {
    case "heading": return { id, type, level: 2, content: [{ text: "New heading" }] };
    case "paragraph": return { id, type, content: [{ text: "" }] };
    case "list": return { id, type, ordered: false, items: [[{ text: "" }]] };
    case "quote": return { id, type, content: [{ text: "" }], attribution: "" };
    case "image": return { id, type, src: "/brand/logo-black-mark.png", alt: "", caption: "", width: 512, height: 559 };
    case "table": return { id, type, caption: "", headers: ["Column 1", "Column 2"], rows: [["", ""]] };
    case "references": return { id, type, title: "References", entries: [{ label: "1", title: "", href: "", detail: "" }] };
    case "divider": return { id, type };
  }
}

function InlineEditor({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: InlineText[];
  onChange(value: InlineText[]): void;
}) {
  const segments = value.length ? value : [{ text: "" }];
  const update = (index: number, next: InlineText) => {
    onChange(segments.map((segment, itemIndex) => itemIndex === index ? next : segment));
  };
  return (
    <fieldset className={styles.inlineEditor}>
      <legend>{label}</legend>
      {segments.map((segment, index) => (
        <div className={styles.inlineSegment} key={`${id}-${index}`}>
          <label className={styles.label} htmlFor={`${id}-text-${index}`}>Text segment {index + 1}</label>
          <textarea
            className={styles.textareaCompact}
            id={`${id}-text-${index}`}
            value={segment.text}
            onChange={(event) => update(index, { ...segment, text: event.target.value })}
          />
          <div className={styles.editorOptionRow}>
            <label className={styles.checkboxCompact}>
              <input
                type="checkbox"
                checked={segment.marks?.includes("bold") ?? false}
                onChange={(event) => {
                  const marks = new Set(segment.marks ?? []);
                  if (event.target.checked) marks.add("bold"); else marks.delete("bold");
                  update(index, { ...segment, marks: marks.size ? [...marks] : undefined });
                }}
              /> Bold
            </label>
            <label className={styles.checkboxCompact}>
              <input
                type="checkbox"
                checked={segment.marks?.includes("italic") ?? false}
                onChange={(event) => {
                  const marks = new Set(segment.marks ?? []);
                  if (event.target.checked) marks.add("italic"); else marks.delete("italic");
                  update(index, { ...segment, marks: marks.size ? [...marks] : undefined });
                }}
              /> Italic
            </label>
            <label className={styles.inlineLinkLabel} htmlFor={`${id}-href-${index}`}>Link</label>
            <input
              className={styles.inputCompact}
              id={`${id}-href-${index}`}
              inputMode="url"
              placeholder="https://…"
              value={segment.href ?? ""}
              onChange={(event) => update(index, { ...segment, href: event.target.value || undefined })}
            />
            <button
              className={styles.buttonQuiet}
              type="button"
              disabled={segments.length === 1}
              onClick={() => onChange(segments.filter((_, itemIndex) => itemIndex !== index))}
            >Remove segment</button>
          </div>
        </div>
      ))}
      <div className={styles.editorOptionRow}>
        <button className={styles.buttonSecondary} type="button" onClick={() => onChange([...segments, { text: "" }])}>Add text segment</button>
        <button
          className={styles.buttonQuiet}
          type="button"
          onClick={() => onChange(segments.map((segment) => ({ text: segment.text })))}
        >Clear formatting and links</button>
      </div>
    </fieldset>
  );
}

function resizeRow(row: string[], width: number): string[] {
  return Array.from({ length: width }, (_, index) => row[index] ?? "");
}

function BlockFields({ block, publicationId, onChange }: {
  block: ArticleBlock;
  publicationId: string;
  onChange(block: ArticleBlock): void;
}) {
  switch (block.type) {
    case "heading":
      return <>
        <label className={styles.label} htmlFor={`${block.id}-level`}>Heading level</label>
        <select className={styles.select} id={`${block.id}-level`} value={block.level} onChange={(event) => onChange({ ...block, level: Number(event.target.value) as 2 | 3 | 4 })}>
          <option value={2}>Heading 2</option><option value={3}>Heading 3</option><option value={4}>Heading 4</option>
        </select>
        <InlineEditor id={block.id} label="Heading text" value={block.content} onChange={(content) => onChange({ ...block, content })} />
      </>;
    case "paragraph":
      return <InlineEditor id={block.id} label="Paragraph content" value={block.content} onChange={(content) => onChange({ ...block, content })} />;
    case "quote":
      return <>
        <InlineEditor id={block.id} label="Quotation" value={block.content} onChange={(content) => onChange({ ...block, content })} />
        <label className={styles.label} htmlFor={`${block.id}-attribution`}>Attribution</label>
        <input className={styles.input} id={`${block.id}-attribution`} value={block.attribution ?? ""} onChange={(event) => onChange({ ...block, attribution: event.target.value })} />
      </>;
    case "list":
      return <>
        <label className={styles.checkboxRow}><input type="checkbox" checked={block.ordered} onChange={(event) => onChange({ ...block, ordered: event.target.checked })} /> Numbered list</label>
        {block.items.map((item, index) => (
          <div className={styles.listItemEditor} key={`${block.id}-item-${index}`}>
            <InlineEditor id={`${block.id}-item-${index}`} label={`List item ${index + 1}`} value={item} onChange={(next) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? next : current) })} />
            <button className={styles.buttonQuiet} type="button" disabled={block.items.length === 1} onClick={() => onChange({ ...block, items: block.items.filter((_, itemIndex) => itemIndex !== index) })}>Remove list item</button>
          </div>
        ))}
        <button className={styles.buttonSecondary} type="button" onClick={() => onChange({ ...block, items: [...block.items, [{ text: "" }]] })}>Add list item</button>
      </>;
    case "image":
      return <div className={styles.formGrid}>
        <div className={styles.fieldWide}>
          <ManagedImageUpload onUploaded={({ src, width, height }) => onChange({ ...block, src, width, height })} publicationId={publicationId} />
        </div>
        <div className={styles.fieldWide}><label className={styles.label} htmlFor={`${block.id}-src`}>Image URL</label><input className={styles.input} id={`${block.id}-src`} inputMode="url" value={block.src} onChange={(event) => onChange({ ...block, src: event.target.value })} /></div>
        <div className={styles.fieldWide}><label className={styles.label} htmlFor={`${block.id}-alt`}>Alternative text</label><input className={styles.input} id={`${block.id}-alt`} value={block.alt} required onChange={(event) => onChange({ ...block, alt: event.target.value })} /></div>
        <div className={styles.fieldWide}><label className={styles.label} htmlFor={`${block.id}-caption`}>Caption</label><input className={styles.input} id={`${block.id}-caption`} value={block.caption ?? ""} onChange={(event) => onChange({ ...block, caption: event.target.value })} /></div>
        <div className={styles.fieldHalf}><label className={styles.label} htmlFor={`${block.id}-width`}>Intrinsic width</label><input className={styles.input} id={`${block.id}-width`} type="number" min={1} max={12000} value={block.width} onChange={(event) => onChange({ ...block, width: Number(event.target.value) })} /></div>
        <div className={styles.fieldHalf}><label className={styles.label} htmlFor={`${block.id}-height`}>Intrinsic height</label><input className={styles.input} id={`${block.id}-height`} type="number" min={1} max={12000} value={block.height} onChange={(event) => onChange({ ...block, height: Number(event.target.value) })} /></div>
        <p className={`${styles.hint} ${styles.fieldWide}`}>Use the managed uploader or an existing same-site raster image path. Alternative text is required before review or publication.</p>
      </div>;
    case "table":
      return <>
        <label className={styles.label} htmlFor={`${block.id}-caption`}>Table caption</label>
        <input className={styles.input} id={`${block.id}-caption`} value={block.caption ?? ""} onChange={(event) => onChange({ ...block, caption: event.target.value })} />
        <label className={styles.label} htmlFor={`${block.id}-headers`}>Column headers (separate with |)</label>
        <input
          className={styles.input}
          id={`${block.id}-headers`}
          value={block.headers.join(" | ")}
          onChange={(event) => {
            const headers = event.target.value.split("|").map((cell) => cell.trim());
            onChange({ ...block, headers, rows: block.rows.map((row) => resizeRow(row, headers.length)) });
          }}
        />
        <label className={styles.label} htmlFor={`${block.id}-rows`}>Rows (one row per line; separate cells with |)</label>
        <textarea
          className={styles.textarea}
          id={`${block.id}-rows`}
          value={block.rows.map((row) => row.join(" | ")).join("\n")}
          onChange={(event) => onChange({
            ...block,
            rows: event.target.value.split("\n").map((row) => resizeRow(row.split("|").map((cell) => cell.trim()), block.headers.length)),
          })}
        />
      </>;
    case "references":
      return <>
        <label className={styles.label} htmlFor={`${block.id}-title`}>Section title</label>
        <input className={styles.input} id={`${block.id}-title`} value={block.title ?? ""} onChange={(event) => onChange({ ...block, title: event.target.value })} />
        {block.entries.map((entry, index) => (
          <ReferenceEditor
            key={`${block.id}-reference-${index}`}
            id={`${block.id}-reference-${index}`}
            index={index}
            value={entry}
            removable={block.entries.length > 1}
            onRemove={() => onChange({ ...block, entries: block.entries.filter((_, itemIndex) => itemIndex !== index) })}
            onChange={(next) => onChange({ ...block, entries: block.entries.map((current, itemIndex) => itemIndex === index ? next : current) })}
          />
        ))}
        <button className={styles.buttonSecondary} type="button" onClick={() => onChange({ ...block, entries: [...block.entries, { label: String(block.entries.length + 1), title: "", href: "", detail: "" }] })}>Add reference</button>
      </>;
    case "divider":
      return <p className={styles.hint}>A visual section divider has no editable content.</p>;
  }
}

function ManagedImageUpload({ publicationId, onUploaded }: {
  publicationId: string;
  onUploaded(value: { src: string; width: number; height: number }): void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function upload() {
    if (!file || pending) return;
    setPending(true);
    setMessage("");
    try {
      const body = new FormData();
      body.set("image", file);
      const response = await fetch(`/api/admin/publications/${encodeURIComponent(publicationId)}/images`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body,
      });
      const result = await response.json() as { error?: string; message?: string; src?: string; width?: number; height?: number };
      if (!response.ok || !result.src || !result.width || !result.height) throw new Error(result.error || "The image could not be uploaded.");
      onUploaded({ src: result.src, width: result.width, height: result.height });
      setMessage(result.message || "Image uploaded.");
      setFile(null);
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
      <button className={styles.buttonSecondary} type="button" disabled={!file || pending} onClick={upload}>{pending ? "Uploading…" : "Upload selected image"}</button>
      <span className={styles.hint} role="status">{message || "JPEG, PNG or WebP; maximum 5 MB. Dimensions are verified on the server."}</span>
    </fieldset>
  );
}

function ReferenceEditor({ id, index, value, removable, onChange, onRemove }: {
  id: string;
  index: number;
  value: ReferenceEntry;
  removable: boolean;
  onChange(value: ReferenceEntry): void;
  onRemove(): void;
}) {
  return (
    <fieldset className={styles.referenceEditor}>
      <legend>Reference {index + 1}</legend>
      <div className={styles.formGrid}>
        <div className={styles.fieldQuarter}><label className={styles.label} htmlFor={`${id}-label`}>Label</label><input className={styles.input} id={`${id}-label`} value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })} /></div>
        <div className={styles.fieldWide}><label className={styles.label} htmlFor={`${id}-title`}>Title</label><input className={styles.input} id={`${id}-title`} value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} /></div>
        <div className={styles.fieldWide}><label className={styles.label} htmlFor={`${id}-href`}>HTTPS link</label><input className={styles.input} id={`${id}-href`} inputMode="url" value={value.href ?? ""} onChange={(event) => onChange({ ...value, href: event.target.value || undefined })} /></div>
        <div className={styles.fieldWide}><label className={styles.label} htmlFor={`${id}-detail`}>Detail</label><textarea className={styles.textareaCompact} id={`${id}-detail`} value={value.detail ?? ""} onChange={(event) => onChange({ ...value, detail: event.target.value })} /></div>
      </div>
      <button className={styles.buttonQuiet} type="button" disabled={!removable} onClick={onRemove}>Remove reference</button>
    </fieldset>
  );
}

export function StructuredBlockEditor({ initialValue, publicationId }: { initialValue: string; publicationId: string }) {
  const incoming = useMemo(() => parseBlocks(initialValue), [initialValue]);
  const [savedJson] = useState(() => JSON.stringify(incoming));
  const [blocks, setBlocks] = useState<ArticleBlock[]>(incoming);
  const [past, setPast] = useState<ArticleBlock[][]>([]);
  const [future, setFuture] = useState<ArticleBlock[][]>([]);
  const [newType, setNewType] = useState<BlockType>("paragraph");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const currentJson = JSON.stringify(blocks);
  const dirty = currentJson !== savedJson;

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const blockNavigation = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest("a[href]");
      if (link && !window.confirm("Leave without saving your article changes?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", blockNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", blockNavigation, true);
    };
  }, [dirty]);

  const commit = (next: ArticleBlock[]) => {
    setPast((items) => [...items, blocks].slice(-50));
    setBlocks(next);
    setFuture([]);
  };
  const updateAt = (index: number, next: ArticleBlock) => commit(blocks.map((block, itemIndex) => itemIndex === index ? next : block));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  return (
    <div className={styles.structuredEditor}>
      <input type="hidden" name="webBody" value={currentJson} />
      <div className={styles.editorToolbar} aria-label="Article editor controls">
        <button className={styles.buttonSecondary} type="button" disabled={!past.length} onClick={() => {
          const previous = past[past.length - 1];
          setPast(past.slice(0, -1));
          setFuture([blocks, ...future]);
          setBlocks(previous);
        }}>Undo</button>
        <button className={styles.buttonSecondary} type="button" disabled={!future.length} onClick={() => {
          const next = future[0];
          setFuture(future.slice(1));
          setPast([...past, blocks]);
          setBlocks(next);
        }}>Redo</button>
        <span className={styles.editorSaveState} role="status">{dirty ? "Unsaved changes" : "Saved version"}</span>
      </div>

      <div className={styles.editorWorkspace}>
        <div>
          <div className={styles.addBlockBar}>
            <label className={styles.label} htmlFor="new-block-type">Add block</label>
            <select className={styles.select} id="new-block-type" value={newType} onChange={(event) => setNewType(event.target.value as BlockType)}>
              {Object.entries(BLOCK_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className={styles.buttonSecondary} type="button" onClick={() => commit([...blocks, createBlock(newType)])}>Add block</button>
          </div>

          {blocks.length ? <ol className={styles.blockList}>
            {blocks.map((block, index) => (
              <li className={styles.blockCard} key={block.id}>
                <div className={styles.blockCardHeader}>
                  <div><span>Block {index + 1}</span><strong>{BLOCK_LABELS[block.type]}</strong></div>
                  <div className={styles.editorOptionRow}>
                    <button className={styles.buttonQuiet} type="button" disabled={index === 0} aria-label={`Move block ${index + 1} up`} onClick={() => move(index, -1)}>↑ Up</button>
                    <button className={styles.buttonQuiet} type="button" disabled={index === blocks.length - 1} aria-label={`Move block ${index + 1} down`} onClick={() => move(index, 1)}>↓ Down</button>
                    <button className={styles.buttonDanger} type="button" onClick={() => {
                      if (window.confirm(`Delete ${BLOCK_LABELS[block.type].toLowerCase()} block ${index + 1}?`)) commit(blocks.filter((_, itemIndex) => itemIndex !== index));
                    }}>Delete</button>
                  </div>
                </div>
                <div className={styles.blockCardBody}><BlockFields block={block} publicationId={publicationId} onChange={(next) => updateAt(index, next)} /></div>
              </li>
            ))}
          </ol> : <div className={styles.editorEmpty}><p>No article blocks yet.</p><button className={styles.buttonSecondary} type="button" onClick={() => commit([createBlock("paragraph")])}>Start with a paragraph</button></div>}
        </div>

        <aside className={styles.editorPreview} aria-label="Live article preview">
          <div className={styles.previewToolbar}>
            <p className={styles.label}>Live preview</p>
            <div className={styles.editorOptionRow}>
              <button className={previewMode === "desktop" ? styles.button : styles.buttonSecondary} type="button" aria-pressed={previewMode === "desktop"} onClick={() => setPreviewMode("desktop")}>Desktop</button>
              <button className={previewMode === "mobile" ? styles.button : styles.buttonSecondary} type="button" aria-pressed={previewMode === "mobile"} onClick={() => setPreviewMode("mobile")}>Mobile</button>
            </div>
          </div>
          <div className={previewMode === "mobile" ? styles.previewMobile : styles.previewDesktop}>
            <PublicationBodyPreview value={currentJson} />
          </div>
        </aside>
      </div>
    </div>
  );
}
