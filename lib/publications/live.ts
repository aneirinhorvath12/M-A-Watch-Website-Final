import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/bootstrap";
import { database, safeJson } from "@/lib/platform";
import { publicationCoverFromStored } from "@/lib/managed-images";
import { resolvePublicationContentMode } from "./content-mode";
import {
  getPublishedPublications,
  getPublicPublication,
} from "./service";
import type {
  ArticleBlock,
  ArticlePublication,
  MarketsPublication,
  Publication,
  PublicationFilters,
  PublicationQuery,
  PublicationSearchResult,
  PublicationType,
} from "./types";

type PublicationRow = {
  id: string;
  type: PublicationType;
  title: string;
  slug: string;
  summary: string;
  publication_date: number;
  status: "published";
  authors: string;
  chapter: string | null;
  cover_image_key: string | null;
  source_pdf_key: string | null;
  web_body: string;
  parser_version: string | null;
  parse_warnings: string;
  structured_metadata: string;
  featured: number;
  search_text: string;
  created_at: number;
  updated_at: number;
  published_at: number | null;
};

const PAGE_SIZE = 6;

type PublicationRuntimeEnv = {
  PUBLICATION_CONTENT_MODE?: string;
};

function usesDemoCatalogue(): boolean {
  return resolvePublicationContentMode(
    (env as unknown as PublicationRuntimeEnv).PUBLICATION_CONTENT_MODE,
  ) === "demo";
}

export async function getLivePublishedPublications(
  type?: PublicationType,
): Promise<Publication[]> {
  if (!usesDemoCatalogue()) return readPublishedRows(type);

  let databaseRecords: Publication[] = [];
  let managedKeys = new Set<string>();
  try {
    [databaseRecords, managedKeys] = await Promise.all([
      readPublishedRows(type),
      readManagedKeys(type),
    ]);
  } catch {
    // Demonstration mode is an explicit local/preview convenience. Managed
    // mode above never substitutes seed records for an unavailable database.
  }
  const seedRecords = getPublishedPublications(type);
  return [...databaseRecords, ...seedRecords.filter((item) => !managedKeys.has(`${item.type}:${item.slug}`))]
    .sort((a, b) => b.publicationDate.localeCompare(a.publicationDate) || a.title.localeCompare(b.title));
}

async function readManagedKeys(type?: PublicationType): Promise<Set<string>> {
  await ensureDatabase();
  const result = type
    ? await database()
        .prepare("SELECT type, slug FROM publications WHERE type = ?")
        .bind(type)
        .all<{ type: PublicationType; slug: string }>()
    : await database()
        .prepare("SELECT type, slug FROM publications")
        .all<{ type: PublicationType; slug: string }>();
  return new Set(result.results.map((item) => `${item.type}:${item.slug}`));
}

export async function getLiveFeaturedPublications(limit = 3): Promise<Publication[]> {
  const publications = await getLivePublishedPublications();
  return [
    ...publications.filter((item) => item.featured),
    ...publications.filter((item) => !item.featured),
  ].slice(0, Math.max(0, limit));
}

export async function getLivePublicPublication(
  type: PublicationType,
  slug: string,
): Promise<Publication | undefined> {
  if (!usesDemoCatalogue()) return (await readPublishedRows(type, slug))[0];

  let rows: Publication[] = [];
  let managedKeys = new Set<string>();
  try {
    [rows, managedKeys] = await Promise.all([
      readPublishedRows(type, slug),
      readManagedKeys(type),
    ]);
  } catch {
    // See getLivePublishedPublications: fallback is permitted only after the
    // environment has explicitly opted into demonstration content.
  }
  if (rows[0]) return rows[0];
  if (managedKeys.has(`${type}:${slug}`)) return undefined;
  return getPublicPublication(type, slug);
}

export async function getLivePublicArticlePublication(
  type: "strategic" | "legal",
  slug: string,
): Promise<ArticlePublication | undefined> {
  const publication = await getLivePublicPublication(type, slug);
  return publication?.type === type ? publication : undefined;
}

export async function searchLivePublishedPublications(
  query: PublicationQuery = {},
): Promise<PublicationSearchResult> {
  const publications = await getLivePublishedPublications(query.type);
  const q = normalise(query.q ?? "");
  const by = normalise(query.by ?? "");
  const filtered = publications.filter((publication) => {
    if (query.year && !publication.publicationDate.startsWith(`${query.year}-`)) return false;
    if (by && !normalise([...publication.authors, publication.chapter ?? ""].join(" ")).includes(by)) {
      return false;
    }
    if (q && !publicationText(publication).includes(q)) return false;
    return true;
  });
  const pageSize = Math.min(24, Math.max(1, Math.floor(query.pageSize ?? PAGE_SIZE)));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.floor(query.page ?? 1)), totalPages);
  const start = (page - 1) * pageSize;
  return { items: filtered.slice(start, start + pageSize), total, totalPages, page, pageSize };
}

export async function getLivePublicationFilters(
  type?: PublicationType,
): Promise<PublicationFilters> {
  const publications = await getLivePublishedPublications(type);
  return {
    years: Array.from(new Set(publications.map((item) => item.publicationDate.slice(0, 4))))
      .sort((a, b) => b.localeCompare(a)),
    attributions: Array.from(
      new Set(publications.flatMap((item) => [...item.authors, ...(item.chapter ? [item.chapter] : [])])),
    ).sort((a, b) => a.localeCompare(b)),
  };
}

export async function getLiveRelatedPublications(
  publication: Publication,
  limit = 3,
): Promise<Publication[]> {
  const candidates = (await getLivePublishedPublications(publication.type)).filter(
    (candidate) => candidate.slug !== publication.slug,
  );
  return candidates
    .map((candidate) => {
      let score = candidate.chapter && candidate.chapter === publication.chapter ? 3 : 0;
      if (candidate.authors.some((author) => publication.authors.includes(author))) score += 3;
      score += candidate.searchKeywords.filter((keyword) => publication.searchKeywords.includes(keyword)).length;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score || b.candidate.publicationDate.localeCompare(a.candidate.publicationDate))
    .slice(0, Math.max(0, limit))
    .map(({ candidate }) => candidate);
}

export async function getLiveAdjacentPublications(publication: Publication): Promise<{
  newer?: Publication;
  older?: Publication;
}> {
  const publications = await getLivePublishedPublications(publication.type);
  const index = publications.findIndex((candidate) => candidate.slug === publication.slug);
  if (index < 0) return {};
  return {
    newer: index > 0 ? publications[index - 1] : undefined,
    older: index < publications.length - 1 ? publications[index + 1] : undefined,
  };
}

async function readPublishedRows(type?: PublicationType, slug?: string): Promise<Publication[]> {
  await ensureDatabase();
  const clauses = ["status = 'published'"];
  const values: string[] = [];
  if (type) {
    clauses.push("type = ?");
    values.push(type);
  }
  if (slug) {
    clauses.push("slug = ?");
    values.push(slug);
  }
  // Collection, search and related-content views must stay metadata-only. A
  // report body can be hundreds of kilobytes and is fetched only by its
  // unique detail route.
  const detailColumns = slug
    ? "cover_image_key, source_pdf_key, web_body, parser_version, parse_warnings"
    : "cover_image_key, NULL AS source_pdf_key, '[]' AS web_body, NULL AS parser_version, '[]' AS parse_warnings";
  const result = await database()
    .prepare(
      `SELECT id, type, title, slug, summary, publication_date, status, authors, chapter,
        ${detailColumns},
        structured_metadata, featured, search_text, created_at, updated_at, published_at
       FROM publications WHERE ${clauses.join(" AND ")}
       ORDER BY publication_date DESC`,
    )
    .bind(...values)
    .all<PublicationRow>();
  return result.results.map(mapRow);
}

function mapRow(row: PublicationRow): Publication {
  const publicationDate = dateOnly(row.publication_date);
  const common = {
    id: row.id,
    type: row.type,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    publicationDate,
    status: "published" as const,
    visibility: "enabled" as const,
    authors: safeJson<string[]>(row.authors, []),
    chapter: row.chapter ?? undefined,
    featured: Boolean(row.featured),
    cover: publicationCoverFromStored(row.cover_image_key, row.slug),
    pdfUrl: `/api/publications/${encodeURIComponent(row.slug)}/pdf`,
    pdfFilename: `${row.slug}.pdf`,
    searchKeywords: searchKeywords(row),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    publishedAt: new Date(row.published_at ?? row.publication_date).toISOString(),
  };
  if (row.type === "markets") {
    const structured = safeJson<{ category?: string }>(row.structured_metadata, {});
    return { ...common, type: "markets", category: structured.category } satisfies MarketsPublication;
  }
  return {
    ...common,
    type: row.type,
    body: safeJson<ArticleBlock[]>(row.web_body, []),
    parserVersion: row.parser_version ?? "manual",
    parseWarnings: safeJson<string[]>(row.parse_warnings, []),
    structured: safeJson<ArticlePublication["structured"]>(row.structured_metadata, {}),
  } satisfies ArticlePublication;
}

function searchKeywords(row: PublicationRow): string[] {
  const structured = safeJson<Record<string, unknown>>(row.structured_metadata, {});
  const explicit = Array.isArray(structured.keywords)
    ? structured.keywords.filter((value): value is string => typeof value === "string")
    : [];
  return [...new Set([...explicit, ...row.search_text.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)])];
}

function dateOnly(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

function normalise(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-GB").trim();
}

function publicationText(publication: Publication): string {
  const blockText = publication.type === "markets" ? "" : publication.body.map((block) => {
    if (block.type === "heading" || block.type === "paragraph" || block.type === "quote") {
      return block.content.map((item) => item.text).join("");
    }
    if (block.type === "list") return block.items.flat().map((item) => item.text).join(" ");
    if (block.type === "table") return [block.caption, ...block.headers, ...block.rows.flat()].join(" ");
    if (block.type === "references") return block.entries.map((entry) => `${entry.title} ${entry.detail ?? ""}`).join(" ");
    if (block.type === "image") return `${block.alt} ${block.caption ?? ""}`;
    return "";
  }).join(" ");
  return normalise([
    publication.title,
    publication.summary,
    ...publication.authors,
    publication.chapter ?? "",
    ...publication.searchKeywords,
    blockText,
  ].join(" "));
}
