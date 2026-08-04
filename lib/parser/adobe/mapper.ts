import { isSafeArticleUrl } from "@/lib/article-block-validation";
import type {
  ParsedBlock,
  PrototypeExtraction,
  UnsupportedStructure,
} from "@/lib/parser/contract";
import type {
  ArticleBlock,
  InlineMark,
  InlineText,
  ReferenceEntry,
  TableBlock,
} from "@/lib/publications/types";

const SUPPORTED_ADOBE_SCHEMA = "1.1.0";
const ADOBE_BLOCK_CONFIDENCE = 0.79;
const MAX_ADOBE_ELEMENTS = 100_000;

type JsonRecord = Record<string, unknown>;

type AdobeElement = {
  raw: JsonRecord;
  path: string;
  page: number | null;
  type: string;
};

type MappedTable = {
  block?: TableBlock;
  unsupported?: string;
  pages: number[];
};

export type AdobeFigureAsset = {
  src: string;
  width: number;
  height: number;
};

export type AdobeStructuredDataMappingOptions = {
  figureAssets?: ReadonlyMap<string, AdobeFigureAsset>;
};

export class AdobeStructuredDataError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AdobeStructuredDataError";
    this.code = code;
  }
}

/**
 * Convert Adobe's source-ordered Extract JSON to the narrow article contract.
 * No prose is generated. Unsupported visual or tabular semantics are retained
 * as explicit editorial warnings instead of being guessed into valid blocks.
 */
export function mapAdobeStructuredData(
  value: Record<string, unknown>,
  options: AdobeStructuredDataMappingOptions = {},
): PrototypeExtraction {
  const schemaVersion = adobeSchemaVersion(value);
  if (schemaVersion !== SUPPORTED_ADOBE_SCHEMA) {
    throw new AdobeStructuredDataError(
      "UNSUPPORTED_SCHEMA",
      `Adobe Extract schema ${schemaVersion} has not been approved by the adapter.`,
    );
  }
  const metadata = record(value.extended_metadata, "extended_metadata");
  const pageCount = positiveInteger(metadata.page_count, "extended_metadata.page_count");
  validatePages(value.pages, pageCount);
  if (!Array.isArray(value.elements) || value.elements.length > MAX_ADOBE_ELEMENTS) {
    throw new AdobeStructuredDataError(
      "INVALID_ELEMENTS",
      "Adobe returned an invalid or oversized element collection.",
    );
  }
  const elements = value.elements.map((item, index) => adobeElement(item, index));
  const pageOrders = sourcePageOrders(elements, pageCount);
  const blocks: ParsedBlock[] = [];
  const unsupported: UnsupportedStructure[] = [];
  let index = 0;

  while (index < elements.length) {
    const element = elements[index];
    const page = requiredElementPage(element, pageCount);
    const order = page === null ? 0 : pageOrders[index];
    if (isReferencesHeading(element)) {
      const mapped = mapReferencesSection(elements, index, pageCount);
      if (mapped.entries.length && page !== null) {
        const id = blockId(page, order, element.path, "references");
        blocks.push({
          id,
          sourcePage: page + 1,
          orderOnPage: order,
          confidence: ADOBE_BLOCK_CONFIDENCE,
          block: {
            type: "references",
            id,
            title: plainText(element.raw) || "References",
            entries: mapped.entries,
          },
        });
        index = mapped.endIndex;
        continue;
      }
    }

    if (isHeadingType(element.type) && page !== null) {
      const content = inlineText(element.raw);
      if (content.length) {
        const id = blockId(page, order, element.path, "heading");
        blocks.push({
          id,
          sourcePage: page + 1,
          orderOnPage: order,
          confidence: ADOBE_BLOCK_CONFIDENCE,
          block: {
            type: "heading",
            id,
            level: headingLevel(element.type),
            content,
          },
        });
      }
      index += 1;
      continue;
    }

    if (element.type === "L" && page !== null) {
      const descendants = descendantsFor(elements, index);
      const items = listItems(element, descendants);
      if (items.length) {
        const id = blockId(page, order, element.path, "list");
        blocks.push({
          id,
          sourcePage: page + 1,
          orderOnPage: order,
          confidence: ADOBE_BLOCK_CONFIDENCE,
          block: {
            type: "list",
            id,
            ordered: listIsOrdered(descendants),
            items,
          },
        });
      } else {
        unsupported.push(
          unsupportedAt(element, order, "List items could not be mapped without guessing."),
        );
      }
      index += 1;
      continue;
    }

    if (element.type === "TABLE" && page !== null) {
      const table = mapTable(element, descendantsFor(elements, index));
      if (table.block) {
        const id = blockId(page, order, element.path, "table");
        blocks.push({
          id,
          sourcePage: page + 1,
          orderOnPage: order,
          confidence: ADOBE_BLOCK_CONFIDENCE,
          block: { ...table.block, id },
        });
        if (table.pages.length > 1) {
          unsupported.push(
            unsupportedAt(
              element,
              order,
              `Table spans source pages ${table.pages.map((item) => item + 1).join(", ")}; verify the merged row order.`,
            ),
          );
        }
      } else {
        unsupported.push(
          unsupportedAt(
            element,
            order,
            table.unsupported ?? "Table structure could not be represented accessibly.",
          ),
        );
      }
      index += 1;
      continue;
    }

    if (element.type === "FIGURE" && page !== null) {
      const paths = stringArray(element.raw.filePaths);
      const assets = paths
        .map((path) => ({ path, asset: options.figureAssets?.get(path) }))
        .filter(
          (entry): entry is { path: string; asset: AdobeFigureAsset } =>
            Boolean(entry.asset),
        );
      if (paths.length === 1 && assets.length === 1) {
        const id = blockId(page, order, element.path, "image");
        const caption = plainText(element.raw);
        blocks.push({
          id,
          sourcePage: page + 1,
          orderOnPage: order,
          confidence: ADOBE_BLOCK_CONFIDENCE,
          block: {
            type: "image",
            id,
            src: assets[0].asset.src,
            alt: "",
            ...(caption ? { caption } : {}),
            width: assets[0].asset.width,
            height: assets[0].asset.height,
          },
        });
      } else {
        unsupported.push(
          unsupportedAt(
            element,
            order,
            "Figure rendition is missing or ambiguous; insert a managed image and human-written alternative text.",
          ),
        );
      }
      index += 1;
      continue;
    }

    if (isParagraphType(element.type) && !insideStructure(element.path) && page !== null) {
      const content = inlineText(element.raw);
      if (content.length) {
        const id = blockId(page, order, element.path, "paragraph");
        blocks.push({
          id,
          sourcePage: page + 1,
          orderOnPage: order,
          confidence: ADOBE_BLOCK_CONFIDENCE,
          block: { type: "paragraph", id, content },
        });
      }
      index += 1;
      continue;
    }

    if (
      page !== null &&
      plainText(element.raw) &&
      !isIgnorableType(element.type) &&
      !insideStructure(element.path)
    ) {
      unsupported.push(
        unsupportedAt(
          element,
          order,
          `Adobe element ${element.type || "UNKNOWN"} contains text but has no approved article mapping.`,
        ),
      );
    }
    index += 1;
  }

  return {
    blocks,
    unsupported,
    metadata: {
      pageCount,
      pdfTitle: optionalString(metadata.title),
      author: optionalString(metadata.author),
    },
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string =>
      typeof entry === "string" && Boolean(entry.trim()),
  ).map((entry) => entry.trim());
}

export function parserVersionForAdobeStructuredData(
  value: Record<string, unknown>,
): string {
  const version = record(value.version, "version");
  const parts = [
    adobeSchemaVersion(value),
    safeVersionPart(version.structure),
    safeVersionPart(version.json_export),
  ].filter(Boolean);
  return `adobe-pdf-extract-${parts.join("-")}`.slice(0, 120);
}

function adobeSchemaVersion(value: Record<string, unknown>): string {
  return requiredString(record(value.version, "version").schema, "version.schema");
}

function validatePages(value: unknown, pageCount: number): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length !== pageCount) {
    throw new AdobeStructuredDataError(
      "PAGE_COUNT_MISMATCH",
      "Adobe page metadata does not match the declared page count.",
    );
  }
  const pageNumbers = value.map((item, index) => {
    const page = record(item, `pages[${index}]`);
    return integer(page.page_number, `pages[${index}].page_number`);
  });
  if (pageNumbers.some((page, index) => page !== index)) {
    throw new AdobeStructuredDataError(
      "INVALID_PAGE_SEQUENCE",
      "Adobe page metadata is not a complete zero-based sequence.",
    );
  }
}

function adobeElement(value: unknown, index: number): AdobeElement {
  const raw = record(value, `elements[${index}]`);
  const path = requiredString(raw.Path, `elements[${index}].Path`);
  const page = raw.Page === undefined ? null : integer(raw.Page, `elements[${index}].Page`);
  return { raw, path, page, type: pathType(path) };
}

function sourcePageOrders(
  elements: readonly AdobeElement[],
  pageCount: number,
): number[] {
  const counters = Array.from({ length: pageCount }, () => 0);
  return elements.map((element) => {
    if (element.page === null || element.page < 0 || element.page >= pageCount) return 0;
    const order = counters[element.page];
    counters[element.page] += 1;
    return order;
  });
}

function requiredElementPage(
  element: AdobeElement,
  pageCount: number,
): number | null {
  if (element.page === null) return null;
  if (element.page < 0 || element.page >= pageCount) {
    throw new AdobeStructuredDataError(
      "INVALID_ELEMENT_PAGE",
      `Adobe element ${element.path} points outside the document page range.`,
    );
  }
  return element.page;
}

function descendantsFor(
  elements: readonly AdobeElement[],
  containerIndex: number,
): AdobeElement[] {
  const container = elements[containerIndex];
  const result: AdobeElement[] = [];
  const seen = new Set<string>();
  appendKids(container.raw, container.path, container.page, result, seen);
  for (let index = containerIndex + 1; index < elements.length; index += 1) {
    const candidate = elements[index];
    if (!isDescendantPath(candidate.path, container.path)) break;
    appendUnique(candidate, result, seen);
  }
  return result;
}

function appendKids(
  raw: JsonRecord,
  parentPath: string,
  inheritedPage: number | null,
  result: AdobeElement[],
  seen: Set<string>,
): void {
  if (!Array.isArray(raw.Kids)) return;
  raw.Kids.forEach((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const childRaw = value as JsonRecord;
    const path = optionalString(childRaw.Path) ?? `${parentPath}/StyleSpan[${index + 1}]`;
    const rawPage = childRaw.Page;
    const page =
      typeof rawPage === "number" && Number.isInteger(rawPage)
        ? rawPage
        : inheritedPage;
    const child: AdobeElement = { raw: childRaw, path, page, type: pathType(path) };
    appendUnique(child, result, seen);
    appendKids(childRaw, path, page, result, seen);
  });
}

function appendUnique(
  element: AdobeElement,
  result: AdobeElement[],
  seen: Set<string>,
): void {
  const key = [element.path, element.page, plainText(element.raw)].join("|");
  if (seen.has(key)) return;
  seen.add(key);
  result.push(element);
}

function listItems(
  container: AdobeElement,
  descendants: readonly AdobeElement[],
): InlineText[][] {
  const listItems = descendants.filter((item) => item.type === "LI");
  const candidates = listItems.length
    ? listItems
    : descendants.filter((item) => item.type === "LBODY");
  if (!candidates.length) {
    const content = inlineText(container.raw);
    return content.length ? [content] : [];
  }
  const seen = new Set<string>();
  const items: InlineText[][] = [];
  for (const item of candidates) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    const body = descendants.find(
      (candidate) =>
        candidate.type === "LBODY" && isDescendantPath(candidate.path, item.path),
    );
    const content = inlineText((body ?? item).raw);
    if (content.length) items.push(content);
  }
  return items;
}

function listIsOrdered(descendants: readonly AdobeElement[]): boolean {
  return descendants
    .filter((item) => item.type === "LBL")
    .some((item) => /^\s*(?:\d+|[a-z]|[ivxlcdm]+)[.)]\s*$/i.test(plainText(item.raw)));
}

function mapTable(
  table: AdobeElement,
  descendants: readonly AdobeElement[],
): MappedTable {
  const cellElements = descendants.filter(
    (item) => item.type === "TH" || item.type === "TD",
  );
  if (!cellElements.length) {
    return { unsupported: "Adobe returned a table without accessible cells.", pages: [] };
  }
  const tableAttributes = optionalRecord(table.raw.attributes);
  const declaredColumns = optionalPositiveInteger(tableAttributes?.NumCol);
  const declaredRows = optionalPositiveInteger(tableAttributes?.NumRow);
  const cells = new Map<string, { text: string; header: boolean; page: number }>();
  let maxRow = -1;
  let maxColumn = -1;
  for (const cell of cellElements) {
    const attributes = optionalRecord(cell.raw.attributes);
    const row = optionalNonNegativeInteger(attributes?.RowIndex) ?? pathIndex(cell.path, "TR");
    const column =
      optionalNonNegativeInteger(attributes?.ColIndex) ??
      pathIndex(cell.path, cell.type);
    const rowSpan = optionalPositiveInteger(attributes?.RowSpan) ?? 1;
    const columnSpan = optionalPositiveInteger(attributes?.ColSpan) ?? 1;
    if (rowSpan !== 1 || columnSpan !== 1) {
      return {
        unsupported: "Merged table cells cannot be represented by the current article schema.",
        pages: uniquePages(cellElements),
      };
    }
    const key = `${row}:${column}`;
    if (cells.has(key)) {
      return {
        unsupported: "Adobe returned duplicate cells at the same table coordinates.",
        pages: uniquePages(cellElements),
      };
    }
    const text = cellText(cell, descendants);
    cells.set(key, { text, header: cell.type === "TH", page: cell.page ?? table.page ?? 0 });
    maxRow = Math.max(maxRow, row);
    maxColumn = Math.max(maxColumn, column);
  }
  const rowCount = declaredRows ?? maxRow + 1;
  const columnCount = declaredColumns ?? maxColumn + 1;
  if (
    rowCount < 1 ||
    columnCount < 1 ||
    maxRow >= rowCount ||
    maxColumn >= columnCount
  ) {
    return {
      unsupported: "Adobe returned inconsistent table dimensions.",
      pages: uniquePages(cellElements),
    };
  }
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      if (!cells.has(`${row}:${column}`)) {
        return {
          unsupported: "Adobe returned an incomplete table grid.",
          pages: uniquePages(cellElements),
        };
      }
    }
  }
  const firstRow = Array.from({ length: columnCount }, (_, column) =>
    cells.get(`0:${column}`),
  );
  if (firstRow.some((cell) => !cell?.header || !cell.text.trim())) {
    return {
      unsupported: "The table has no complete explicit header row.",
      pages: uniquePages(cellElements),
    };
  }
  if (
    Array.from(cells.entries()).some(([key, cell]) =>
      Number(key.split(":")[0]) > 0 ? cell.header : false,
    )
  ) {
    return {
      unsupported: "Row headers cannot be represented by the current article schema.",
      pages: uniquePages(cellElements),
    };
  }
  const captionElement = descendants.find((item) => item.type === "CAPTION");
  return {
    block: {
      type: "table",
      id: "pending",
      caption: captionElement ? plainText(captionElement.raw) || undefined : undefined,
      headers: firstRow.map((cell) => cell?.text ?? ""),
      rows: Array.from({ length: rowCount - 1 }, (_, rowOffset) =>
        Array.from({ length: columnCount }, (_, column) =>
          cells.get(`${rowOffset + 1}:${column}`)?.text ?? "",
        ),
      ),
    },
    pages: uniquePages(cellElements),
  };
}

function cellText(
  cell: AdobeElement,
  descendants: readonly AdobeElement[],
): string {
  const direct = plainText(cell.raw);
  if (direct) return direct;
  return descendants
    .filter(
      (item) =>
        isDescendantPath(item.path, cell.path) &&
        (isParagraphType(item.type) || item.type === "STYLESPAN"),
    )
    .map((item) => plainText(item.raw))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function mapReferencesSection(
  elements: readonly AdobeElement[],
  headingIndex: number,
  pageCount: number,
): { entries: ReferenceEntry[]; endIndex: number } {
  const entries: ReferenceEntry[] = [];
  let index = headingIndex + 1;
  for (; index < elements.length; index += 1) {
    const element = elements[index];
    requiredElementPage(element, pageCount);
    if (isHeadingType(element.type)) break;
    if (!isParagraphType(element.type) || insideStructure(element.path)) continue;
    const content = inlineText(element.raw);
    const text = content.map((item) => item.text).join("").trim();
    if (!text) continue;
    const parsed = referenceLabel(text);
    const href = content.find((item) => item.href)?.href;
    entries.push({
      label: parsed.label,
      title: parsed.title,
      ...(href ? { href } : {}),
    });
  }
  return { entries, endIndex: index };
}

function referenceLabel(text: string): { label: string; title: string } {
  const match = text.match(/^\s*(?:\[([^\]]{1,20})\]|(\d{1,4})[.)])\s*/);
  if (!match) return { label: "", title: text };
  return {
    label: (match[1] ?? match[2] ?? "").trim(),
    title: text.slice(match[0].length).trim() || text,
  };
}

function inlineText(raw: JsonRecord): InlineText[] {
  const kids = Array.isArray(raw.Kids)
    ? raw.Kids.flatMap((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? inlineText(item as JsonRecord)
          : [],
      )
    : [];
  if (kids.length) return mergeInline(kids);
  const text = sourceText(raw.Text);
  if (!text) return [];
  const marks: InlineMark[] = [];
  const font = optionalRecord(raw.Font);
  const weight = typeof font?.weight === "number" ? font.weight : 0;
  const fontName = optionalString(font?.name) ?? "";
  if (weight >= 700 || /(?:bold|black|heavy)/i.test(fontName)) marks.push("bold");
  if (font?.italic === true || /italic/i.test(fontName)) marks.push("italic");
  const reference = optionalString(raw.Reference);
  const href = reference && isSafeArticleUrl(reference) ? reference : undefined;
  return [{ text, ...(marks.length ? { marks } : {}), ...(href ? { href } : {}) }];
}

function mergeInline(items: readonly InlineText[]): InlineText[] {
  const merged: InlineText[] = [];
  for (const item of items) {
    if (!item.text) continue;
    const previous = merged.at(-1);
    if (
      previous &&
      previous.href === item.href &&
      JSON.stringify(previous.marks ?? []) === JSON.stringify(item.marks ?? [])
    ) {
      previous.text += item.text;
    } else {
      merged.push({
        text: item.text,
        ...(item.marks ? { marks: [...item.marks] } : {}),
        ...(item.href ? { href: item.href } : {}),
      });
    }
  }
  return merged;
}

function plainText(raw: JsonRecord): string {
  return inlineText(raw).map((item) => item.text).join("").trim();
}

function sourceText(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalised = value.replace(/\u0000/g, "").replace(/\s+/g, " ");
  return normalised.trim() ? normalised : "";
}

function isReferencesHeading(element: AdobeElement): boolean {
  return isHeadingType(element.type) && /^references\s*$/i.test(plainText(element.raw));
}

function isHeadingType(type: string): boolean {
  return type === "TITLE" || type === "H" || /^H[1-6]$/.test(type);
}

function headingLevel(type: string): 2 | 3 | 4 {
  if (type === "H3") return 3;
  if (/^H[4-6]$/.test(type)) return 4;
  return 2;
}

function isParagraphType(type: string): boolean {
  return [
    "P",
    "PARAGRAPHSPAN",
    "SUB",
    "FOOTNOTE",
    "ASIDE",
    "TOCI",
    "REFERENCE",
    "CAPTION",
  ].includes(type);
}

function isIgnorableType(type: string): boolean {
  return [
    "DOCUMENT",
    "SECT",
    "PART",
    "ART",
    "DIV",
    "TOC",
    "WATERMARK",
    "STYLESPAN",
    "LI",
    "LBL",
    "LBODY",
    "TR",
    "TH",
    "TD",
  ].includes(type);
}

function insideStructure(path: string): boolean {
  const types = path.split("/").filter(Boolean).map(segmentType);
  return types.some((type) =>
    ["TABLE", "TR", "TH", "TD", "L", "LI", "LBL", "LBODY"].includes(type),
  );
}

function pathType(path: string): string {
  const segment = path.split("/").filter(Boolean).at(-1) ?? "";
  return segmentType(segment);
}

function segmentType(segment: string): string {
  return segment.replace(/\[\d+\]$/, "").toUpperCase();
}

function pathIndex(path: string, targetType: string): number {
  const segment = path
    .split("/")
    .filter(Boolean)
    .reverse()
    .find((item) => segmentType(item) === targetType);
  const match = segment?.match(/\[(\d+)\]$/);
  return match ? Math.max(0, Number(match[1]) - 1) : 0;
}

function isDescendantPath(candidate: string, parent: string): boolean {
  return candidate.length > parent.length && candidate.startsWith(`${parent}/`);
}

function uniquePages(elements: readonly AdobeElement[]): number[] {
  return [...new Set(elements.flatMap((item) => (item.page === null ? [] : [item.page])))]
    .sort((a, b) => a - b);
}

function unsupportedAt(
  element: AdobeElement,
  orderOnPage: number,
  description: string,
): UnsupportedStructure {
  return {
    sourcePage: (element.page ?? 0) + 1,
    orderOnPage,
    description,
  };
}

function blockId(
  page: number,
  order: number,
  path: string,
  type: ArticleBlock["type"],
): string {
  return `adobe-${type}-${page + 1}-${order}-${hash(path)}`;
}

function hash(value: string): string {
  let current = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    current ^= value.charCodeAt(index);
    current = Math.imul(current, 16777619);
  }
  return (current >>> 0).toString(16).padStart(8, "0");
}

function safeVersionPart(value: unknown): string | null {
  const raw = optionalString(value);
  if (!raw) return null;
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 30) || null;
}

function record(value: unknown, field: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdobeStructuredDataError(
      "INVALID_RESPONSE_SHAPE",
      `Adobe ${field} must be an object.`,
    );
  }
  return value as JsonRecord;
}

function optionalRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdobeStructuredDataError(
      "INVALID_RESPONSE_SHAPE",
      `Adobe ${field} must be a non-empty string.`,
    );
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new AdobeStructuredDataError(
      "INVALID_RESPONSE_SHAPE",
      `Adobe ${field} must be an integer.`,
    );
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = integer(value, field);
  if (parsed < 1) {
    throw new AdobeStructuredDataError(
      "INVALID_RESPONSE_SHAPE",
      `Adobe ${field} must be positive.`,
    );
  }
  return parsed;
}

function optionalPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function optionalNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}
