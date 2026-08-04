import type { ArticleBlock, InlineText } from "@/lib/publications/types";

const MAX_BLOCKS = 5_000;
const MAX_INLINE_ITEMS = 10_000;
const MAX_TEXT_LENGTH = 100_000;
export const MAX_ARTICLE_BODY_BYTES = 750_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown, maxLength = MAX_TEXT_LENGTH): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isOptionalString(value: unknown, maxLength = MAX_TEXT_LENGTH): boolean {
  return value === undefined || isString(value, maxLength);
}

function isIdentifier(value: unknown): value is string {
  return isString(value, 200) && value.trim().length > 0;
}

export function isSafeArticleUrl(value: string): boolean {
  if (
    value.trim() !== value ||
    /[\u0000-\u001f\u007f\\]/.test(value)
  ) {
    return false;
  }
  if (value.startsWith("#")) return true;
  if (value.startsWith("/")) {
    if (value.startsWith("//")) return false;
    try {
      const url = new URL(value, "https://mawatch.invalid");
      return (
        url.origin === "https://mawatch.invalid" &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" && !url.username && !url.password) ||
      url.protocol === "mailto:"
    );
  } catch {
    return false;
  }
}

function isSafeArticleImageUrl(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || /[\u0000-\u001f\\]/.test(value)) return false;
  try {
    const url = new URL(value, "https://mawatch.invalid");
    const decoded = decodeURIComponent(url.pathname);
    return (
      url.origin === "https://mawatch.invalid" &&
      !url.hash &&
      !decoded.split("/").some((segment) => segment === "." || segment === "..") &&
      /\.(?:avif|jpe?g|png|webp)$/i.test(decoded)
    );
  } catch {
    return false;
  }
}

function isInlineText(value: unknown): value is InlineText {
  if (!isRecord(value) || !isString(value.text)) return false;
  if (
    value.marks !== undefined &&
    (!Array.isArray(value.marks) ||
      value.marks.some((mark) => mark !== "bold" && mark !== "italic"))
  ) {
    return false;
  }
  return (
    value.href === undefined ||
    (isString(value.href, 2_048) && isSafeArticleUrl(value.href))
  );
}

function isInlineContent(value: unknown): value is InlineText[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_INLINE_ITEMS &&
    value.every(isInlineText)
  );
}

function isStringArray(value: unknown, maxItems = 1_000): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => isString(item))
  );
}

function isArticleBlock(value: unknown): value is ArticleBlock {
  if (!isRecord(value) || !isIdentifier(value.id) || !isString(value.type, 20)) {
    return false;
  }
  switch (value.type) {
    case "heading":
      return (
        (value.level === 2 || value.level === 3 || value.level === 4) &&
        isInlineContent(value.content)
      );
    case "paragraph":
      return isInlineContent(value.content);
    case "quote":
      return (
        isInlineContent(value.content) &&
        isOptionalString(value.attribution, 500)
      );
    case "list":
      return (
        typeof value.ordered === "boolean" &&
        Array.isArray(value.items) &&
        value.items.length <= 2_000 &&
        value.items.every(isInlineContent)
      );
    case "image":
      return (
        isString(value.src, 2_048) &&
        isSafeArticleImageUrl(value.src) &&
        isString(value.alt, 2_000) &&
        isOptionalString(value.caption, 10_000) &&
        Number.isInteger(value.width) &&
        Number(value.width) > 0 &&
        Number(value.width) <= 8_192 &&
        Number.isInteger(value.height) &&
        Number(value.height) > 0 &&
        Number(value.height) <= 8_192 &&
        Number(value.width) * Number(value.height) <= 24_000_000
      );
    case "table": {
      const headers = value.headers;
      return (
        isOptionalString(value.caption, 10_000) &&
        isStringArray(headers, 200) &&
        headers.length > 0 &&
        Array.isArray(value.rows) &&
        value.rows.length <= 10_000 &&
        value.rows.every(
          (row) => isStringArray(row, 200) && row.length === headers.length,
        )
      );
    }
    case "references":
      return (
        isOptionalString(value.title, 500) &&
        Array.isArray(value.entries) &&
        value.entries.length <= 5_000 &&
        value.entries.every(
          (entry) =>
            isRecord(entry) &&
            isString(entry.label, 100) &&
            isString(entry.title, 10_000) &&
            isOptionalString(entry.detail, 20_000) &&
            (entry.href === undefined ||
              (isString(entry.href, 2_048) && isSafeArticleUrl(entry.href))),
        )
      );
    case "divider":
      return true;
    default:
      return false;
  }
}

export function validateArticleBlocks(value: unknown): value is ArticleBlock[] {
  if (!Array.isArray(value) || value.length > MAX_BLOCKS || !value.every(isArticleBlock)) {
    return false;
  }
  const ids = new Set(value.map((block) => block.id));
  return ids.size === value.length;
}
