import { env } from "cloudflare:workers";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { PageHeader, Panel, StatusBadge, adminStyles as styles } from "@/components/admin/AdminUI";
import { PublicationJobStatus } from "@/components/admin/PublicationJobStatus";
import { StructuredBlockEditor } from "@/components/admin/StructuredBlockEditor";
import { formatAdminDate, getPublicationAdmin, titleCaseStatus } from "@/lib/admin-data";
import { publicationCoverFromStored } from "@/lib/managed-images";
import { resolveMalwareProvider } from "@/lib/malware-provider";
import { resolveParserProvider } from "@/lib/parser/provider";
import { database, privateFiles, safeJson } from "@/lib/platform";
import {
  actionablePublicationWarnings,
  publicationWarningMessage,
} from "@/lib/publication-warnings";

export const dynamic = "force-dynamic";

type RevisionRow = { id: string; revision_number: number; note: string | null; created_at: number; created_by_name: string | null };
type JobRow = { id: string; type: string; status: string; error: string | null; created_at: number; updated_at: number };

function londonDateTimeValue(value: number | null): string {
  if (!value) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export default async function PublicationReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const publication = await getPublicationAdmin(id);
  if (!publication) notFound();
  const [revisions, jobs, object] = await Promise.all([
    database().prepare(
      `SELECT revisions.id, revisions.revision_number, revisions.note, revisions.created_at,
              users.name AS created_by_name
       FROM publication_revisions revisions LEFT JOIN admin_users users ON users.id = revisions.created_by
       WHERE revisions.publication_id = ? ORDER BY revisions.revision_number DESC LIMIT 30`,
    ).bind(id).all<RevisionRow>(),
    database().prepare(
      `SELECT id, type, status, error, created_at, updated_at FROM background_jobs
       WHERE json_extract(payload, '$.publicationId') = ? ORDER BY created_at DESC LIMIT 12`,
    ).bind(id).all<JobRow>(),
    publication.source_pdf_key ? privateFiles().head(publication.source_pdf_key) : Promise.resolve(null),
  ]);
  const warnings = actionablePublicationWarnings(publication.parse_warnings);
  const authors = safeJson<string[]>(publication.authors, []);
  const cover = publicationCoverFromStored(publication.cover_image_key, publication.id);
  const scanJob = jobs.results.find((job) => job.type === "file_scan");
  const scanStatus = !object
    ? "missing"
    : scanJob?.status === "succeeded" && object.customMetadata?.scanStatus === "clean"
      ? "succeeded"
      : scanJob?.status === "failed" || object.customMetadata?.scanStatus === "rejected"
        ? "failed"
        : scanJob?.status ?? "queued";
  const runtime = env as Parameters<typeof resolveMalwareProvider>[0] &
    Parameters<typeof resolveParserProvider>[0];
  const malwareScannerConfigured = Boolean(resolveMalwareProvider(runtime));
  const parserConfigured =
    publication.type === "markets" || Boolean(resolveParserProvider(runtime));
  const hasArticleBody = safeJson<unknown[]>(publication.web_body, []).length > 0;
  const canRecoverManually = ["uploaded", "parsing", "parse_failed"].includes(
    publication.status,
  );
  const canAcknowledgeWarnings =
    warnings.length > 0 &&
    !publication.parse_error &&
    ["draft", "review"].includes(publication.status) &&
    (publication.type === "markets" || hasArticleBody);
  const canSendToReview =
    publication.type !== "markets" &&
    publication.status === "draft" &&
    warnings.length === 0 &&
    !publication.parse_error;
  const canPublishOrSchedule =
    warnings.length === 0 &&
    !publication.parse_error &&
    (publication.type === "markets"
      ? ["draft", "review", "scheduled"].includes(publication.status)
      : ["review", "scheduled"].includes(publication.status));

  return (
    <>
      <PageHeader
        eyebrow={`${titleCaseStatus(publication.type)} · ${titleCaseStatus(publication.status)}`}
        title={publication.title}
        description={`Last edited ${formatAdminDate(publication.updated_at, true)}${publication.updated_by_name ? ` by ${publication.updated_by_name}` : ""}.`}
        actions={<><StatusBadge value={titleCaseStatus(publication.status)} /><Link className={styles.button} href={`/preview/publications/${publication.id}`} target="_blank">Open exact preview</Link><Link className={styles.buttonSecondary} href="/admin/publications">Back to list</Link></>}
      />

      {scanStatus !== "succeeded" ? (
        <div className={styles.noticeWarning} role="status">
          <strong>Source security status: {titleCaseStatus(scanStatus)}.</strong>{" "}
          {!malwareScannerConfigured
            ? "This environment does not have an external malware scanner configured. You may switch to manual editing, but publishing remains locked until a scanner reports the source as clean."
            : scanStatus === "failed"
              ? "The scan did not complete successfully. Replace the PDF or ask an operator to retry processing; publishing remains locked."
              : "Built-in PDF inspection passed at upload. Automated processing may continue in the background, and publishing remains locked until the external scanner reports this file as clean."}
        </div>
      ) : <div className={styles.noticeSuccess}>Source file security scan succeeded.</div>}
      {publication.type !== "markets" && !parserConfigured ? (
        <div className={styles.noticeWarning} role="status">
          <strong>Automatic PDF extraction is not configured.</strong> Use the manual-draft recovery action and build the approved web article in the editor below.
        </div>
      ) : null}
      <PublicationJobStatus publicationId={publication.id} initialStatus={publication.status} />
      {publication.parse_error ? <div className={styles.noticeError} role="alert"><strong>Automatic extraction failed:</strong> {publication.parse_error} Nothing has been published. Recover with a manual draft, edit it below and compare it with the source PDF.</div> : null}
      {warnings.length ? (
        <div className={styles.noticeWarning}>
          <strong>{warnings.length} parser warning{warnings.length === 1 ? "" : "s"} awaiting editorial review</strong>
          <p>Correct the article in the editor, save it, then mark these warnings reviewed. The original warnings remain in revision and audit history.</p>
          <ul className={styles.warningList}>{warnings.map((warning, index) => <li key={index}>{publicationWarningMessage(warning)}</li>)}</ul>
          {canAcknowledgeWarnings ? (
            <ActionForm
              action={`/api/admin/publications/${id}`}
              method="PATCH"
              submitLabel="Mark warnings reviewed"
              buttonTone="secondary"
              confirmation={`Confirm that you checked the edited article against the source PDF and resolved all ${warnings.length} warning${warnings.length === 1 ? "" : "s"}?`}
            >
              <input type="hidden" name="intent" value="acknowledge_warnings" />
            </ActionForm>
          ) : (
            <p className={styles.hint}>Create or recover a manual Draft and save at least one checked article block before acknowledging these warnings.</p>
          )}
        </div>
      ) : null}

      <Panel title="Editorial workflow" meta="Times are entered in Europe/London">
        <div className={styles.panelBody}>
          <div className={styles.buttonRow}>
            {canRecoverManually ? (
              <ActionForm
                action={`/api/admin/publications/${id}`}
                method="PATCH"
                submitLabel={publication.status === "parse_failed" ? "Recover with manual draft" : "Switch to manual editing"}
                buttonTone="secondary"
                confirmation="Stop waiting for automatic extraction and continue with a manual editable draft? Any later parser result will be retained in revision history and will not overwrite your edits."
              >
                <input type="hidden" name="intent" value="manual_draft" />
              </ActionForm>
            ) : null}
            {canSendToReview ? (
              <ActionForm action={`/api/admin/publications/${id}`} method="PATCH" submitLabel="Send to review" buttonTone="secondary">
                <input type="hidden" name="intent" value="review" />
              </ActionForm>
            ) : null}
            {canPublishOrSchedule ? (
              <ActionForm action={`/api/admin/publications/${id}`} method="PATCH" submitLabel="Publish now" confirmation="Publish this item to the public website now?">
                <input type="hidden" name="intent" value="publish" />
              </ActionForm>
            ) : publication.status === "published" ? (
              <ActionForm action={`/api/admin/publications/${id}`} method="PATCH" submitLabel="Unpublish to draft" buttonTone="secondary" confirmation="Remove this publication from the public website?">
                <input type="hidden" name="intent" value="unpublish" />
              </ActionForm>
            ) : null}
            {publication.status === "archived" ? (
              <ActionForm action={`/api/admin/publications/${id}`} method="PATCH" submitLabel="Restore to draft" buttonTone="secondary">
                <input type="hidden" name="intent" value="restore" />
              </ActionForm>
            ) : null}
            {publication.status !== "archived" ? (
              <ActionForm action={`/api/admin/publications/${id}`} method="PATCH" submitLabel="Archive" buttonTone="danger" confirmation="Archive this publication? It will not be public.">
                <input type="hidden" name="intent" value="archive" />
              </ActionForm>
            ) : null}
          </div>
          {canPublishOrSchedule ? (
            <ActionForm action={`/api/admin/publications/${id}`} method="PATCH" submitLabel="Schedule publication" buttonTone="secondary" confirmation="Schedule this publication using Europe/London editorial time?">
              <input type="hidden" name="intent" value="schedule" />
              <div className={styles.fieldHalf}>
                <label className={styles.label} htmlFor="scheduledAt">Publish at</label>
                <input className={styles.input} id="scheduledAt" name="scheduledAt" type="datetime-local" defaultValue={londonDateTimeValue(publication.scheduled_at)} required />
              </div>
            </ActionForm>
          ) : null}
          {!canRecoverManually && !canSendToReview && !canPublishOrSchedule && publication.status !== "published" && publication.status !== "archived" ? (
            <p className={styles.hint}>Save the article, resolve its parser warnings and follow the displayed recovery action before advancing the workflow.</p>
          ) : null}
        </div>
      </Panel>

      <Panel title="Metadata" meta="Save does not publish">
        <div className={styles.panelBody}>
          <ActionForm action={`/api/admin/publications/${id}`} method="PATCH" submitLabel="Save metadata">
            <input type="hidden" name="intent" value="save" />
            <input type="hidden" name="featuredPresent" value="true" />
            <div className={styles.formGrid}>
              <div className={styles.fieldHalf}><label className={styles.label} htmlFor="title">Title</label><input className={styles.input} id="title" name="title" defaultValue={publication.title} required /></div>
              <div className={styles.fieldHalf}><label className={styles.label} htmlFor="slug">URL slug</label><input className={styles.input} id="slug" name="slug" defaultValue={publication.slug} required /></div>
              <div className={styles.fieldWide}><label className={styles.label} htmlFor="summary">Summary</label><textarea className={styles.textarea} id="summary" name="summary" defaultValue={publication.summary} /></div>
              <div className={styles.fieldThird}><label className={styles.label} htmlFor="publicationDate">Publication date</label><input className={styles.input} id="publicationDate" name="publicationDate" type="date" defaultValue={new Date(publication.publication_date).toISOString().slice(0, 10)} required /></div>
              <div className={styles.fieldThird}><label className={styles.label} htmlFor="authors">Authors</label><input className={styles.input} id="authors" name="authors" defaultValue={authors.join(", ")} /></div>
              <div className={styles.fieldThird}><label className={styles.label} htmlFor="chapter">Chapter or team</label><input className={styles.input} id="chapter" name="chapter" defaultValue={publication.chapter ?? ""} /></div>
              <div className={styles.fieldWide}><label className={styles.checkboxRow}><input type="checkbox" name="featured" value="true" defaultChecked={Boolean(publication.featured)} /> Feature when published</label></div>
            </div>
          </ActionForm>
        </div>
      </Panel>

      <Panel title="Publication cover" meta="Optional · shown on cards and report pages">
        <div className={styles.panelBody}>
          {cover ? (
            <div className={styles.previewBox}>
              <Image
                src={cover.src}
                alt={cover.alt}
                width={cover.width}
                height={cover.height}
                sizes="(max-width: 800px) 100vw, 520px"
                unoptimized
              />
              <p className={styles.hint}>{cover.alt} · {cover.width} × {cover.height}px</p>
            </div>
          ) : <p className={styles.emptyText}>No cover is set. Branded fallback artwork is used publicly.</p>}
          {publication.status !== "archived" ? (
            <ActionForm
              action={`/api/admin/publications/${id}/cover`}
              mode="form-data"
              submitLabel={cover ? "Replace cover" : "Upload cover"}
              pendingLabel="Uploading…"
              buttonTone="secondary"
            >
              <div className={styles.formGrid}>
                <div className={styles.fieldWide}><label className={styles.label} htmlFor="cover">JPEG, PNG or WebP cover</label><input className={styles.input} id="cover" name="cover" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" required /></div>
                <div className={styles.fieldWide}><label className={styles.label} htmlFor="coverAlt">Alternative text</label><input className={styles.input} id="coverAlt" name="alt" defaultValue={cover?.alt ?? ""} maxLength={300} required /><span className={styles.hint}>Describe the cover&apos;s meaningful visual content; do not repeat “image of”.</span></div>
              </div>
            </ActionForm>
          ) : null}
          {cover ? (
            <ActionForm
              action={`/api/admin/publications/${id}/cover`}
              method="DELETE"
              submitLabel="Remove cover"
              buttonTone="danger"
              confirmation="Remove this cover? Public pages will return to the branded fallback artwork; an already loaded image may remain cached for up to five minutes."
            />
          ) : null}
        </div>
      </Panel>

      {publication.type !== "markets" ? (
        <Panel title="Approved web article" meta="Structured, controlled blocks">
          <div className={styles.panelBody}>
            <ActionForm action={`/api/admin/publications/${id}`} method="PATCH" submitLabel="Save article revision">
              <input type="hidden" name="intent" value="save" />
              <StructuredBlockEditor key={publication.updated_at} initialValue={publication.web_body} publicationId={publication.id} />
              <span className={styles.hint}>Add, delete and reorder controlled blocks; edit formatting, links, tables, captions and alternative text; and use the desktop/mobile live preview. Save never publishes.</span>
            </ActionForm>
          </div>
        </Panel>
      ) : (
        <div className={styles.notice}>Markets is intentionally PDF-only. The source is not sent through the article parser.</div>
      )}

      <div className={styles.gridTwo}>
        <Panel title="Replace source PDF" meta="Prior revisions remain available">
          <div className={styles.panelBody}>
            <ActionForm action={`/api/admin/publications/${id}`} method="PATCH" mode="form-data" submitLabel="Upload replacement" pendingLabel="Uploading…" buttonTone="secondary" confirmation="Replace the source PDF and queue a fresh security scan? Existing editorial content will be preserved.">
              <input type="hidden" name="confirmReplace" value="true" />
              <div className={styles.fieldWide}><label className={styles.label} htmlFor="sourcePdf">Replacement PDF</label><input className={styles.input} id="sourcePdf" name="sourcePdf" type="file" accept="application/pdf,.pdf" required /></div>
            </ActionForm>
          </div>
        </Panel>
        <Panel title="Processing queue" meta={`${jobs.results.length} recent job${jobs.results.length === 1 ? "" : "s"}`}>
          <div className={styles.panelBody}>
            {jobs.results.length ? <ul className={styles.timeline}>{jobs.results.map((job) => <li className={styles.timelineItem} key={job.id}><div className={styles.timelineTitle}>{titleCaseStatus(job.type)} · <StatusBadge value={titleCaseStatus(job.status)} /></div><div className={styles.timelineMeta}>{formatAdminDate(job.updated_at, true)}</div>{job.error ? <p className={styles.noteBody}>{job.error}</p> : null}</li>)}</ul> : <p className={styles.emptyText}>No background work has been recorded.</p>}
          </div>
        </Panel>
      </div>

      <Panel title="Revision history" meta={`${revisions.results.length} retained`}>
        {revisions.results.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Revision</th>
                  <th>Note</th>
                  <th>Editor</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {revisions.results.map((revision) => (
                  <tr key={revision.id}>
                    <td>#{revision.revision_number}</td>
                    <td>{revision.note ?? "Editorial revision"}</td>
                    <td>{revision.created_by_name ?? "System"}</td>
                    <td>{formatAdminDate(revision.created_at, true)}</td>
                    <td>
                      <ActionForm
                        action={`/api/admin/publications/${id}/revisions/${revision.id}`}
                        method="POST"
                        submitLabel="Apply this revision"
                        pendingLabel="Applying…"
                        buttonTone="quiet"
                        confirmation={`Apply revision #${revision.revision_number}? The current body will be retained as a snapshot and this publication will move to Draft, removing it from the public website or schedule.`}
                      >
                        <input type="hidden" name="confirmApply" value="true" />
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.empty}>
            <h2 className={styles.emptyTitle}>No revisions yet</h2>
            <p className={styles.emptyText}>Saved article and source revisions will be retained here.</p>
          </div>
        )}
      </Panel>
    </>
  );
}
