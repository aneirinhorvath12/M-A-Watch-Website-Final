import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArticlePublicationPage, MarketsPublicationPage } from "@/components/publications";
import { getAdminActor } from "@/lib/admin-auth";
import { getPublicationAdmin } from "@/lib/admin-data";
import { safeJson } from "@/lib/platform";
import { publicationCoverFromStored } from "@/lib/managed-images";
import type { ArticleBlock, ArticlePublication, MarketsPublication } from "@/lib/publications";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Private publication preview",
  robots: { index: false, follow: false, nocache: true },
};

function dateOnly(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

export default async function PublicationPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getAdminActor();
  if (!actor) redirect(`/admin/login?return_to=${encodeURIComponent(`/preview/publications/${id}`)}`);
  const row = await getPublicationAdmin(id);
  if (!row || row.status === "archived") notFound();

  const common = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    publicationDate: dateOnly(row.publication_date),
    status: "published" as const,
    visibility: "disabled" as const,
    authors: safeJson<string[]>(row.authors, []),
    chapter: row.chapter ?? undefined,
    featured: Boolean(row.featured),
    cover: publicationCoverFromStored(row.cover_image_key, row.id),
    pdfUrl: `/api/files/publications/${encodeURIComponent(row.id)}/source`,
    pdfFilename: `${row.slug}.pdf`,
    searchKeywords: [],
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    publishedAt: new Date(row.published_at ?? row.publication_date).toISOString(),
  };
  const publication = row.type === "markets"
    ? ({ ...common, type: "markets", category: safeJson<{ category?: string }>(row.structured_metadata, {}).category } satisfies MarketsPublication)
    : ({
        ...common,
        type: row.type,
        body: safeJson<ArticleBlock[]>(row.web_body, []),
        parserVersion: row.parser_version ?? "manual",
        parseWarnings: safeJson<string[]>(row.parse_warnings, []),
        structured: safeJson<ArticlePublication["structured"]>(row.structured_metadata, {}),
      } satisfies ArticlePublication);

  return (
    <>
      <div className={styles.banner} role="status">
        <strong>Private preview · {row.status.replace(/_/g, " ")}</strong>
        <span>This route is visible only to active administrators and is excluded from search engines.</span>
        <Link href={`/admin/publications/${row.id}`}>Return to editing</Link>
      </div>
      {publication.type === "markets"
        ? <MarketsPublicationPage publication={publication} privatePreview />
        : <ArticlePublicationPage publication={publication} privatePreview />}
    </>
  );
}
