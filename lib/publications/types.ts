export const PUBLICATION_TYPES = ["strategic", "legal", "markets"] as const;

export type PublicationType = (typeof PUBLICATION_TYPES)[number];

export const PUBLICATION_STATUSES = [
  "uploaded",
  "parsing",
  "draft",
  "review",
  "scheduled",
  "published",
  "archived",
  "parse-failed",
] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export type InlineMark = "bold" | "italic";

export interface InlineText {
  text: string;
  marks?: InlineMark[];
  href?: string;
}

export interface HeadingBlock {
  type: "heading";
  id: string;
  level: 2 | 3 | 4;
  content: InlineText[];
}

export interface ParagraphBlock {
  type: "paragraph";
  id: string;
  content: InlineText[];
}

export interface ListBlock {
  type: "list";
  id: string;
  ordered: boolean;
  items: InlineText[][];
}

export interface QuoteBlock {
  type: "quote";
  id: string;
  content: InlineText[];
  attribution?: string;
}

export interface ImageBlock {
  type: "image";
  id: string;
  src: string;
  alt: string;
  caption?: string;
  width: number;
  height: number;
}

export interface TableBlock {
  type: "table";
  id: string;
  caption?: string;
  headers: string[];
  rows: string[][];
}

export interface ReferenceEntry {
  label: string;
  title: string;
  href?: string;
  detail?: string;
}

export interface ReferencesBlock {
  type: "references";
  id: string;
  title?: string;
  entries: ReferenceEntry[];
}

export interface DividerBlock {
  type: "divider";
  id: string;
}

export type ArticleBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | QuoteBlock
  | ImageBlock
  | TableBlock
  | ReferencesBlock
  | DividerBlock;

export interface PublicationCover {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface PublicationBase {
  id: string;
  type: PublicationType;
  title: string;
  slug: string;
  summary: string;
  publicationDate: string;
  status: PublicationStatus;
  visibility: "enabled" | "disabled";
  scheduledFor?: string;
  authors: string[];
  chapter?: string;
  featured: boolean;
  cover?: PublicationCover;
  pdfUrl: string;
  pdfFilename: string;
  placeholderContent?: boolean;
  searchKeywords: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface ArticlePublication extends PublicationBase {
  type: "strategic" | "legal";
  body: ArticleBlock[];
  parserVersion: string;
  parseWarnings: string[];
  structured: {
    acquirer?: string;
    target?: string;
    dealValue?: string;
    sector?: string;
    geography?: string;
    dealStatus?: string;
  };
}

export interface MarketsPublication extends PublicationBase {
  type: "markets";
  category?: string;
  body?: never;
}

export type Publication = ArticlePublication | MarketsPublication;

export interface PublicationQuery {
  q?: string;
  year?: string;
  by?: string;
  type?: PublicationType;
  page?: number;
  pageSize?: number;
}

export interface PublicationSearchResult {
  items: Publication[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PublicationFilters {
  years: string[];
  attributions: string[];
}

export type PublicationSearchParams = Record<
  string,
  string | string[] | undefined
>;
