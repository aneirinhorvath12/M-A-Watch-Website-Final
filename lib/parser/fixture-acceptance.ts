import { validateArticleBlocks } from "@/lib/article-block-validation";
import type { ArticleBlock, InlineText } from "@/lib/publications/types";
import {
  PARSER_CONTRACT_VERSION,
  type ParsedBlock,
  type ParserFixture,
  type ParserFixtureAcceptance,
  type ParserFixtureGolden,
  type ParserResult,
} from "./contract";

type ExpectedElement = ParserFixture["expectedElements"][number];

const MANUAL_ELEMENTS = new Set<ExpectedElement>(["page-spanning-text"]);

function normaliseText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLocaleLowerCase("en-GB")
    .trim();
}

function inlineText(items: readonly InlineText[]): string {
  return items.map((item) => item.text).join("");
}

function blockText(block: ArticleBlock): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "quote":
      return inlineText(block.content);
    case "list":
      return block.items.map(inlineText).join(" ");
    case "image":
      return [block.alt, block.caption ?? ""].join(" ");
    case "table":
      return [block.caption ?? "", ...block.headers, ...block.rows.flat()].join(" ");
    case "references":
      return [
        block.title ?? "",
        ...block.entries.flatMap((entry) => [entry.label, entry.title, entry.detail ?? ""]),
      ].join(" ");
    case "divider":
      return "";
  }
}

function inlineHasLink(items: readonly InlineText[]): boolean {
  return items.some((item) => Boolean(item.href));
}

function blockHasLink(block: ArticleBlock): boolean {
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "quote":
      return inlineHasLink(block.content);
    case "list":
      return block.items.some(inlineHasLink);
    case "references":
      return block.entries.some((entry) => Boolean(entry.href));
    default:
      return false;
  }
}

function observedElements(blocks: readonly ParsedBlock[]): Set<ExpectedElement> {
  const observed = new Set<ExpectedElement>();
  for (const { block } of blocks) {
    if (
      block.type === "heading" ||
      block.type === "paragraph" ||
      block.type === "list" ||
      block.type === "image" ||
      block.type === "table" ||
      block.type === "references"
    ) {
      observed.add(block.type);
    }
    if (blockHasLink(block)) observed.add("link");
    if (
      (block.type === "image" || block.type === "table") &&
      Boolean(block.caption?.trim())
    ) {
      observed.add("caption");
    }
  }
  return observed;
}

function compareCoordinates(a: ParsedBlock, b: ParsedBlock): number {
  return a.sourcePage - b.sourcePage || a.orderOnPage - b.orderOnPage;
}

/**
 * Compares a real adapter result with the immutable representative-report
 * baseline. Source-page continuity and the fixture's editorial notes remain
 * explicit human checks; the harness never pretends those judgements can be
 * inferred from a block count.
 */
export function evaluateParserFixture(
  fixture: ParserFixture,
  golden: ParserFixtureGolden,
  result: ParserResult,
): ParserFixtureAcceptance {
  const failures: string[] = [];
  const manualChecks = [...fixture.editorialNotes];

  if (golden.fixtureId !== fixture.id) failures.push("The golden baseline targets a different fixture.");
  if (result.contractVersion !== PARSER_CONTRACT_VERSION) failures.push("The parser contract version does not match.");
  if (result.status !== "draft") failures.push("The representative report did not produce a draft.");
  if (result.publicationId !== fixture.id) failures.push("The parser result targets a different fixture.");
  if (result.metadata.pageCount !== fixture.pageCount) {
    failures.push(`Expected ${fixture.pageCount} pages but the adapter reported ${result.metadata.pageCount}.`);
  }
  if (!result.blocks.length) failures.push("The adapter returned no article blocks.");

  const articleBlocks = result.blocks.map(({ block }) => block);
  if (!validateArticleBlocks(articleBlocks)) failures.push("The adapter returned an unsafe or malformed article block.");

  const ids = new Set<string>();
  result.blocks.forEach((parsed, index) => {
    if (ids.has(parsed.id)) failures.push(`Duplicate block id: ${parsed.id}.`);
    ids.add(parsed.id);
    if (parsed.id !== parsed.block.id) failures.push(`Block identity mismatch: ${parsed.id}.`);
    if (!Number.isInteger(parsed.sourcePage) || parsed.sourcePage < 1 || parsed.sourcePage > fixture.pageCount) {
      failures.push(`Block ${parsed.id} has an invalid source page.`);
    }
    if (!Number.isInteger(parsed.orderOnPage) || parsed.orderOnPage < 0) {
      failures.push(`Block ${parsed.id} has an invalid page order.`);
    }
    if (!Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1) {
      failures.push(`Block ${parsed.id} has an invalid confidence value.`);
    }
    if (index > 0 && compareCoordinates(result.blocks[index - 1], parsed) > 0) {
      failures.push(`Block ${parsed.id} is out of source order.`);
    }
  });

  const observed = observedElements(result.blocks);
  for (const expected of fixture.expectedElements) {
    if (MANUAL_ELEMENTS.has(expected)) {
      manualChecks.push("Verify page-spanning text against the source PDF without omissions or duplicated lines.");
    } else if (!observed.has(expected)) {
      failures.push(`Expected element was not observed: ${expected}.`);
    }
  }

  for (const check of golden.pageChecks) {
    manualChecks.push(check.manualReview);
    const pageObserved = observedElements(
      result.blocks.filter((block) => check.pages.includes(block.sourcePage)),
    );
    for (const expected of check.requiredElements) {
      if (MANUAL_ELEMENTS.has(expected)) continue;
      if (!pageObserved.has(expected)) {
        failures.push(
          `Page check ${check.id} did not observe ${expected} on page${check.pages.length === 1 ? "" : "s"} ${check.pages.join(", ")}.`,
        );
      }
    }
  }

  const outputText = normaliseText(result.blocks.map(({ block }) => blockText(block)).join(" "));
  let anchorOffset = 0;
  for (const anchor of golden.orderedTextAnchors) {
    const normalisedAnchor = normaliseText(anchor);
    const index = outputText.indexOf(normalisedAnchor, anchorOffset);
    if (index < 0) {
      failures.push(`Ordered source anchor is missing: ${anchor}.`);
    } else {
      anchorOffset = index + normalisedAnchor.length;
    }
  }

  if (result.warnings.some((warning) => warning.severity === "error")) {
    failures.push("The parser result contains an error-severity warning.");
  }

  return {
    fixtureId: fixture.id,
    automatedChecksPassed: failures.length === 0,
    failures: [...new Set(failures)],
    manualChecks: [...new Set(manualChecks)],
    observedElements: [...observed].sort(),
  };
}
