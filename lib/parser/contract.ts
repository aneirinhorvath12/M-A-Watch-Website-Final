import type { ArticleBlock, PublicationType } from "@/lib/publications/types";

export const PARSER_CONTRACT_VERSION = "1.0.0";
export const MAX_SOURCE_PDF_BYTES = 50 * 1024 * 1024;

export type ParseJobStatus = "draft" | "parse-failed";

export type ParseWarningCode =
  | "INVALID_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "EMPTY_FILE"
  | "INVALID_PDF_SIGNATURE"
  | "MISSING_DOCUMENT_TITLE"
  | "UNCERTAIN_READING_ORDER"
  | "LOW_CONFIDENCE_BLOCK"
  | "UNSUPPORTED_STRUCTURE"
  | "MISSING_IMAGE_ALT"
  | "MALFORMED_TABLE"
  | "EMPTY_BLOCK"
  | "DUPLICATE_BLOCK_ID";

export interface ParseWarning {
  id: string;
  code: ParseWarningCode;
  severity: "info" | "warning" | "error";
  message: string;
  sourcePage?: number;
  blockId?: string;
  requiresEditorialReview: boolean;
}

export interface ParserInput {
  jobId: string;
  publicationId: string;
  publicationType: Extract<PublicationType, "strategic" | "legal">;
  filename: string;
  mimeType: string;
  size: number;
  /** First bytes are sufficient for signature validation in the prototype. */
  bytes?: Uint8Array;
  requestedAt: string;
}

export interface ParsedBlock {
  id: string;
  sourcePage: number;
  orderOnPage: number;
  confidence: number;
  block: ArticleBlock;
}

export interface UnsupportedStructure {
  sourcePage: number;
  orderOnPage: number;
  description: string;
}

/**
 * Output expected from a future PDF extraction adapter. The deterministic
 * prototype below owns validation, ordering and warnings; an adapter must only
 * report what it observed and must never rewrite prose.
 */
export interface PrototypeExtraction {
  blocks: ParsedBlock[];
  unsupported: UnsupportedStructure[];
  metadata: {
    pageCount: number;
    pdfTitle?: string;
    author?: string;
  };
}

export interface ParserResult {
  contractVersion: typeof PARSER_CONTRACT_VERSION;
  parserVersion: string;
  jobId: string;
  publicationId: string;
  status: ParseJobStatus;
  blocks: ParsedBlock[];
  warnings: ParseWarning[];
  metadata: PrototypeExtraction["metadata"];
  completedAt: string;
}

export interface ParserFixture {
  id: string;
  filename: string;
  publicPath?: string;
  pageCount: number;
  pageSize: "A4" | "US Letter";
  expectedElements: readonly (
    | "heading"
    | "paragraph"
    | "list"
    | "link"
    | "image"
    | "caption"
    | "table"
    | "references"
    | "page-spanning-text"
  )[];
  editorialNotes: readonly string[];
}
