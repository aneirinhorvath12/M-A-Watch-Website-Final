import { publicationRecords } from "./data";
import {
  PUBLICATION_TYPES,
  type ArticleBlock,
  type ArticlePublication,
  type Publication,
  type PublicationFilters,
  type PublicationQuery,
  type PublicationSearchParams,
  type PublicationSearchResult,
  type PublicationType,
} from "./types";

const DEFAULT_PAGE_SIZE = 6;
const MAX_PAGE_SIZE = 24;

function normalise(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-GB")
    .trim();
}

function inlineText(block: ArticleBlock): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "quote":
      return block.content.map((item) => item.text).join("");
    case "list":
      return block.items.flat().map((item) => item.text).join(" ");
    case "table":
      return [block.caption ?? "", ...block.headers, ...block.rows.flat()].join(" ");
    case "references":
      return block.entries
        .flatMap((entry) => [entry.title, entry.detail ?? ""])
        .join(" ");
    case "image":
      return [block.alt, block.caption ?? ""].join(" ");
    case "divider":
      return "";
  }
}

function searchableText(publication: Publication): string {
  const body =
    publication.type === "markets"
      ? ""
      : publication.body.map(inlineText).join(" ");

  return normalise(
    [
      publication.title,
      publication.summary,
      ...publication.authors,
      publication.chapter ?? "",
      ...publication.searchKeywords,
      body,
    ].join(" "),
  );
}

function isPublic(publication: Publication): boolean {
  return publication.status === "published" && publication.visibility === "enabled";
}

function byNewest(a: Publication, b: Publication): number {
  return b.publicationDate.localeCompare(a.publicationDate) || a.title.localeCompare(b.title);
}

export function getPublicationHref(publication: Publication): string {
  if (publication.type === "markets") return `/markets/${publication.slug}`;
  return `/reports/${publication.type}/${publication.slug}`;
}

export function getPublicationTypeLabel(type: PublicationType): string {
  const labels: Record<PublicationType, string> = {
    strategic: "Strategic Deal Report",
    legal: "Legal Report",
    markets: "Markets",
  };
  return labels[type];
}

export function formatPublicationDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

export function getPublishedPublications(type?: PublicationType): Publication[] {
  return publicationRecords
    .filter((publication) => isPublic(publication) && (!type || publication.type === type))
    .slice()
    .sort(byNewest);
}

export function getFeaturedPublications(limit = 3): Publication[] {
  const published = getPublishedPublications();
  const featured = published.filter((publication) => publication.featured);
  const fallback = published.filter((publication) => !publication.featured);
  return [...featured, ...fallback].slice(0, Math.max(0, limit));
}

export function getPublicPublication(
  type: PublicationType,
  slug: string,
): Publication | undefined {
  return publicationRecords.find(
    (publication) =>
      publication.type === type && publication.slug === slug && isPublic(publication),
  );
}

export function getPublicArticlePublication(
  type: "strategic" | "legal",
  slug: string,
): ArticlePublication | undefined {
  const publication = getPublicPublication(type, slug);
  return publication?.type === type ? publication : undefined;
}

export function searchPublishedPublications(
  query: PublicationQuery = {},
): PublicationSearchResult {
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(query.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const requestedPage = Math.max(1, Math.floor(query.page ?? 1));
  const q = query.q ? normalise(query.q) : "";
  const by = query.by ? normalise(query.by) : "";

  const filtered = getPublishedPublications(query.type).filter((publication) => {
    if (q && !searchableText(publication).includes(q)) return false;
    if (query.year && !publication.publicationDate.startsWith(`${query.year}-`)) return false;
    if (by) {
      const attributions = normalise(
        [...publication.authors, publication.chapter ?? ""].join(" "),
      );
      if (!attributions.includes(by)) return false;
    }
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export function getPublicationFilters(type?: PublicationType): PublicationFilters {
  const publications = getPublishedPublications(type);
  const years = Array.from(
    new Set(publications.map((publication) => publication.publicationDate.slice(0, 4))),
  ).sort((a, b) => b.localeCompare(a));
  const attributions = Array.from(
    new Set(
      publications.flatMap((publication) => [
        ...publication.authors,
        ...(publication.chapter ? [publication.chapter] : []),
      ]),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return { years, attributions };
}

export function getRelatedPublications(publication: Publication, limit = 3): Publication[] {
  const candidates = getPublishedPublications(publication.type).filter(
    (candidate) => candidate.slug !== publication.slug,
  );

  const scored = candidates.map((candidate) => {
    let score = 0;
    if (candidate.chapter && candidate.chapter === publication.chapter) score += 3;
    if (candidate.authors.some((author) => publication.authors.includes(author))) score += 3;
    const overlappingKeywords = candidate.searchKeywords.filter((keyword) =>
      publication.searchKeywords.includes(keyword),
    ).length;
    score += overlappingKeywords;
    return { publication: candidate, score };
  });

  return scored
    .sort(
      (a, b) => b.score - a.score || byNewest(a.publication, b.publication),
    )
    .slice(0, Math.max(0, limit))
    .map(({ publication: candidate }) => candidate);
}

export function getAdjacentPublications(publication: Publication): {
  newer?: Publication;
  older?: Publication;
} {
  const publications = getPublishedPublications(publication.type);
  const index = publications.findIndex((candidate) => candidate.slug === publication.slug);
  if (index < 0) return {};
  return {
    newer: index > 0 ? publications[index - 1] : undefined,
    older: index < publications.length - 1 ? publications[index + 1] : undefined,
  };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const item = Array.isArray(value) ? value[0] : value;
  const trimmed = item?.trim();
  return trimmed ? trimmed.slice(0, 160) : undefined;
}

export function parsePublicationSearchParams(
  params: PublicationSearchParams,
  fixedType?: PublicationType,
): PublicationQuery {
  const rawType = firstParam(params.type);
  const type = fixedType ??
    (PUBLICATION_TYPES.includes(rawType as PublicationType)
      ? (rawType as PublicationType)
      : undefined);
  const rawPage = Number.parseInt(firstParam(params.page) ?? "1", 10);

  return {
    q: firstParam(params.q),
    year: firstParam(params.year)?.replace(/[^0-9]/g, "").slice(0, 4),
    by: firstParam(params.by),
    type,
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

export function publicationQueryString(
  query: PublicationQuery,
  overrides: Partial<PublicationQuery> = {},
): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.year) params.set("year", merged.year);
  if (merged.by) params.set("by", merged.by);
  if (merged.type) params.set("type", merged.type);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));
  const value = params.toString();
  return value ? `?${value}` : "";
}
