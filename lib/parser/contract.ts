import type { ArticleBlock, PublicationType } from "@/lib/publications/types";

export const PARSER_CONTRACT_VERSION = "1.0.0";
export const MAX_SOURCE_PDF_BYTES = 50 * 1024 * 1024;

export type ParseJobStatus = "draft" | "parse-failed";

export type ParseWarningCode =
  | "INVALID_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "EMPTY_FILE"
  | "INVALID_PDF_SIGNATURE"
  | "INVALID_PAGE_COUNT"
  | "NO_USABLE_CONTENT"
  | "INVALID_BLOCK_COORDINATES"
  | "BLOCK_ID_MISMATCH"
  | "INVALID_BLOCK_SHAPE"
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
  /** First bytes are sufficient, but must be supplied for signature validation. */
  bytes?: Uint8Array;
  requestedAt: string;
}

export interface ParsedBlock {
  id: string;
  /** One-based page number in the source PDF. */
  sourcePage: number;
  /** Zero-based position among extracted structures on that page. */
  orderOnPage: number;
  confidence: number;
  block: ArticleBlock;
}

export interface UnsupportedStructure {
  /** One-based page number in the source PDF. */
  sourcePage: number;
  /** Zero-based position among extracted structures on that page. */
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

export interface ParserFixtureGolden {
  schemaVersion: "1.0";
  fixtureId: string;
  sourceSha256: string;
  sourceByteLength: number;
  /**
   * Short, source-backed phrases that must survive extraction in this order.
   * Comparison is case-, punctuation- and whitespace-insensitive.
   */
  orderedTextAnchors: readonly string[];
  pageChecks: readonly {
    id: string;
    pages: readonly number[];
    requiredElements: readonly (ParserFixture["expectedElements"][number])[];
    manualReview: string;
  }[];
}

export interface ParserFixtureAcceptance {
  fixtureId: string;
  automatedChecksPassed: boolean;
  failures: readonly string[];
  /** Checks that remain deliberately human-owned rather than guessed in code. */
  manualChecks: readonly string[];
  observedElements: readonly (ParserFixture["expectedElements"][number])[];
}
