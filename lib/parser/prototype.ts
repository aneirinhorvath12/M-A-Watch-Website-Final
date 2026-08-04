import { validateArticleBlocks } from "@/lib/article-block-validation";
import {
  MAX_SOURCE_PDF_BYTES,
  PARSER_CONTRACT_VERSION,
  type ParsedBlock,
  type ParserInput,
  type ParserResult,
  type ParseWarning,
  type ParseWarningCode,
  type PrototypeExtraction,
} from "./contract";

const PROTOTYPE_VERSION = "deterministic-prototype-1.0.0";

function hash(value: string): string {
  let current = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    current ^= value.charCodeAt(index);
    current = Math.imul(current, 16777619);
  }
  return (current >>> 0).toString(16).padStart(8, "0");
}

function warning(
  input: ParserInput,
  code: ParseWarningCode,
  message: string,
  options: {
    severity?: ParseWarning["severity"];
    sourcePage?: number;
    blockId?: string;
    requiresEditorialReview?: boolean;
  } = {},
): ParseWarning {
  const identity = [
    input.jobId,
    code,
    options.sourcePage ?? 0,
    options.blockId ?? "file",
    message,
  ].join(":");
  return {
    id: `warning-${hash(identity)}`,
    code,
    severity: options.severity ?? "warning",
    message,
    sourcePage: options.sourcePage,
    blockId: options.blockId,
    requiresEditorialReview: options.requiresEditorialReview ?? true,
  };
}

function hasPdfSignature(bytes: Uint8Array | undefined): boolean {
  if (!bytes || bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function validateInput(input: ParserInput): ParseWarning[] {
  const warnings: ParseWarning[] = [];
  const pdfName = input.filename.toLocaleLowerCase("en-GB").endsWith(".pdf");
  if (input.mimeType !== "application/pdf" || !pdfName) {
    warnings.push(
      warning(input, "INVALID_FILE_TYPE", "The source must be a PDF file.", {
        severity: "error",
        requiresEditorialReview: false,
      }),
    );
  }
  if (input.size <= 0) {
    warnings.push(
      warning(input, "EMPTY_FILE", "The uploaded PDF is empty.", {
        severity: "error",
        requiresEditorialReview: false,
      }),
    );
  }
  if (input.size > MAX_SOURCE_PDF_BYTES) {
    warnings.push(
      warning(
        input,
        "FILE_TOO_LARGE",
        `The PDF exceeds the ${MAX_SOURCE_PDF_BYTES / 1024 / 1024} MB parser limit.`,
        { severity: "error", requiresEditorialReview: false },
      ),
    );
  }
  if (!hasPdfSignature(input.bytes)) {
    warnings.push(
      warning(input, "INVALID_PDF_SIGNATURE", "The file does not begin with a PDF signature.", {
        severity: "error",
        requiresEditorialReview: false,
      }),
    );
  }
  return warnings;
}

function blockIsEmpty(parsed: ParsedBlock): boolean {
  const block = parsed.block;
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "quote":
      return block.content.every((part) => part.text.trim().length === 0);
    case "list":
      return block.items.length === 0;
    case "table":
      return block.headers.length === 0 && block.rows.length === 0;
    case "references":
      return block.entries.length === 0;
    case "image":
      return !block.src;
    case "divider":
      return false;
  }
}

function validateExtraction(
  input: ParserInput,
  extraction: PrototypeExtraction,
): ParseWarning[] {
  const warnings: ParseWarning[] = [];
  const pageCountIsValid =
    Number.isInteger(extraction.metadata.pageCount) && extraction.metadata.pageCount > 0;
  if (!pageCountIsValid) {
    warnings.push(
      warning(input, "INVALID_PAGE_COUNT", "The extractor returned an invalid PDF page count.", {
        severity: "error",
        requiresEditorialReview: false,
      }),
    );
  }
  if (extraction.blocks.length === 0) {
    warnings.push(
      warning(input, "NO_USABLE_CONTENT", "The extractor returned no usable article content.", {
        severity: "error",
        requiresEditorialReview: false,
      }),
    );
  }
  const blockIds = new Set<string>();
  const hasTitle = extraction.blocks.some(
    ({ block }) =>
      validateArticleBlocks([block]) &&
      block.type === "heading" &&
      (block.level === 2 || block.level === 3) &&
      block.content.some((part) => part.text.trim().length > 0),
  );

  if (!extraction.metadata.pdfTitle?.trim() && !hasTitle) {
    warnings.push(
      warning(
        input,
        "MISSING_DOCUMENT_TITLE",
        "No reliable document title was found; an editor must supply one.",
      ),
    );
  }

  for (const parsed of extraction.blocks) {
    if (blockIds.has(parsed.id)) {
      warnings.push(
        warning(input, "DUPLICATE_BLOCK_ID", "Two extracted blocks share an identifier.", {
          severity: "error",
          sourcePage: parsed.sourcePage,
          blockId: parsed.id,
          requiresEditorialReview: false,
        }),
      );
    }
    blockIds.add(parsed.id);

    if (
      !Number.isInteger(parsed.sourcePage) ||
      parsed.sourcePage < 1 ||
      (pageCountIsValid && parsed.sourcePage > extraction.metadata.pageCount) ||
      !Number.isInteger(parsed.orderOnPage) ||
      parsed.orderOnPage < 0 ||
      !Number.isFinite(parsed.confidence) ||
      parsed.confidence < 0 ||
      parsed.confidence > 1
    ) {
      warnings.push(
        warning(
          input,
          "INVALID_BLOCK_COORDINATES",
          "The extractor returned invalid source coordinates or confidence.",
          {
            severity: "error",
            sourcePage: parsed.sourcePage,
            blockId: parsed.id,
            requiresEditorialReview: false,
          },
        ),
      );
    }
    if (!validateArticleBlocks([parsed.block])) {
      const rawBlock = parsed.block as unknown;
      const isTable =
        Boolean(rawBlock) &&
        typeof rawBlock === "object" &&
        !Array.isArray(rawBlock) &&
        (rawBlock as { type?: unknown }).type === "table";
      warnings.push(
        warning(
          input,
          isTable ? "MALFORMED_TABLE" : "INVALID_BLOCK_SHAPE",
          isTable
            ? "Table rows do not match a complete accessible table shape."
            : "The extractor returned an unsafe or malformed block.",
          {
            severity: "error",
            sourcePage: parsed.sourcePage,
            blockId: parsed.id,
            requiresEditorialReview: false,
          },
        ),
      );
      continue;
    }
    if (parsed.id !== parsed.block.id) {
      warnings.push(
        warning(input, "BLOCK_ID_MISMATCH", "The extracted block identity is inconsistent.", {
          severity: "error",
          sourcePage: parsed.sourcePage,
          blockId: parsed.id,
          requiresEditorialReview: false,
        }),
      );
    }

    if (parsed.confidence < 0.8) {
      warnings.push(
        warning(
          input,
          "LOW_CONFIDENCE_BLOCK",
          `This block was extracted with ${Math.round(parsed.confidence * 100)}% confidence.`,
          { sourcePage: parsed.sourcePage, blockId: parsed.id },
        ),
      );
    }
    if (blockIsEmpty(parsed)) {
      warnings.push(
        warning(input, "EMPTY_BLOCK", "The extracted block has no usable content.", {
          sourcePage: parsed.sourcePage,
          blockId: parsed.id,
        }),
      );
    }
    if (parsed.block.type === "image" && !parsed.block.alt.trim()) {
      warnings.push(
        warning(
          input,
          "MISSING_IMAGE_ALT",
          "Image alternative text is required before publication.",
          { sourcePage: parsed.sourcePage, blockId: parsed.id },
        ),
      );
    }
  }

  for (const unsupported of extraction.unsupported) {
    warnings.push(
      warning(
        input,
        "UNSUPPORTED_STRUCTURE",
        `Unsupported source structure: ${unsupported.description}`,
        { sourcePage: unsupported.sourcePage },
      ),
    );
  }
  return warnings;
}

function compareReadingOrder(a: ParsedBlock, b: ParsedBlock): number {
  return a.sourcePage - b.sourcePage || a.orderOnPage - b.orderOnPage;
}

/**
 * Deterministic parser boundary used until a production PDF extraction adapter
 * is selected. It validates a source and normalises explicit source coordinates
 * into reading order. It does not infer, paraphrase or generate report text.
 */
export function runParserPrototype(
  input: ParserInput,
  extraction: PrototypeExtraction,
  completedAt = new Date().toISOString(),
): ParserResult {
  const inputWarnings = validateInput(input);
  if (inputWarnings.some((item) => item.severity === "error")) {
    return {
      contractVersion: PARSER_CONTRACT_VERSION,
      parserVersion: PROTOTYPE_VERSION,
      jobId: input.jobId,
      publicationId: input.publicationId,
      status: "parse-failed",
      blocks: [],
      warnings: inputWarnings,
      metadata: extraction.metadata,
      completedAt,
    };
  }

  const blocks = extraction.blocks.slice().sort(compareReadingOrder);
  const originalOrder = extraction.blocks.map((item) => item.id).join("|");
  const normalisedOrder = blocks.map((item) => item.id).join("|");
  const orderWarnings =
    originalOrder === normalisedOrder
      ? []
      : [
          warning(
            input,
            "UNCERTAIN_READING_ORDER",
            "Blocks arrived out of source-page order and were ordered by their explicit coordinates.",
          ),
        ];

  const extractionWarnings = validateExtraction(input, extraction);
  const warnings = [...inputWarnings, ...orderWarnings, ...extractionWarnings];
  if (warnings.some((item) => item.severity === "error")) {
    return {
      contractVersion: PARSER_CONTRACT_VERSION,
      parserVersion: PROTOTYPE_VERSION,
      jobId: input.jobId,
      publicationId: input.publicationId,
      status: "parse-failed",
      blocks: [],
      warnings,
      metadata: extraction.metadata,
      completedAt,
    };
  }

  return {
    contractVersion: PARSER_CONTRACT_VERSION,
    parserVersion: PROTOTYPE_VERSION,
    jobId: input.jobId,
    publicationId: input.publicationId,
    status: "draft",
    blocks,
    warnings,
    metadata: extraction.metadata,
    completedAt,
  };
}
