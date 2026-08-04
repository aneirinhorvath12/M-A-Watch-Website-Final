import {
  MAX_ARTICLE_BODY_BYTES,
  validateArticleBlocks,
} from "@/lib/article-block-validation";
import type { ArticleBlock } from "@/lib/publications/types";
import { utf8ByteLength } from "@/lib/text-limits";

export const MAX_PARSE_WARNINGS_BYTES = 96_000;

export type ValidatedPublicationRevision = {
  blocks: ArticleBlock[];
  webBody: string;
  parseWarnings: string;
};

export type PublicationRevisionValidation =
  | { ok: true; value: ValidatedPublicationRevision }
  | { ok: false; error: string };

export function validatePublicationRevision(
  webBody: string,
  parseWarnings: string,
): PublicationRevisionValidation {
  if (utf8ByteLength(webBody) > MAX_ARTICLE_BODY_BYTES) {
    return { ok: false, error: "This revision exceeds the article size limit." };
  }

  let blocks: unknown;
  try {
    blocks = JSON.parse(webBody);
  } catch {
    return { ok: false, error: "This revision contains invalid article JSON." };
  }
  if (!validateArticleBlocks(blocks)) {
    return {
      ok: false,
      error: "This revision contains an unsafe, incomplete or unsupported article block.",
    };
  }

  const canonicalBody = JSON.stringify(blocks);
  if (utf8ByteLength(canonicalBody) > MAX_ARTICLE_BODY_BYTES) {
    return { ok: false, error: "This revision exceeds the article size limit." };
  }
  if (utf8ByteLength(parseWarnings) > MAX_PARSE_WARNINGS_BYTES) {
    return { ok: false, error: "This revision contains too many parser warnings." };
  }

  let warnings: unknown;
  try {
    warnings = JSON.parse(parseWarnings);
  } catch {
    return { ok: false, error: "This revision contains invalid parser warnings." };
  }
  if (!Array.isArray(warnings)) {
    return { ok: false, error: "This revision contains invalid parser warnings." };
  }

  const canonicalWarnings = JSON.stringify(warnings);
  if (utf8ByteLength(canonicalWarnings) > MAX_PARSE_WARNINGS_BYTES) {
    return { ok: false, error: "This revision contains too many parser warnings." };
  }

  return {
    ok: true,
    value: {
      blocks,
      webBody: canonicalBody,
      parseWarnings: canonicalWarnings,
    },
  };
}
