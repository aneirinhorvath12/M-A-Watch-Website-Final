import assert from "node:assert/strict";
import test from "node:test";
import { runParserPrototype } from "../lib/parser/prototype";
import { representativeReportFixtures } from "../lib/parser/fixtures/representative-reports";
import type { ParserInput, PrototypeExtraction } from "../lib/parser/contract";
import { validateArticleBlocks } from "../lib/article-block-validation";

const input: ParserInput = {
  jobId: "job_test_parser",
  publicationId: "publication_test",
  publicationType: "strategic",
  filename: "report.pdf",
  mimeType: "application/pdf",
  size: 128,
  bytes: new TextEncoder().encode("%PDF-1.7"),
  requestedAt: "2026-08-04T12:00:00.000Z",
};

test("parser rejects a file whose bytes do not contain the PDF signature", () => {
  const result = runParserPrototype(
    { ...input, bytes: new TextEncoder().encode("not-a-pdf") },
    { blocks: [], unsupported: [], metadata: { pageCount: 1 } },
    "2026-08-04T12:01:00.000Z",
  );
  assert.equal(result.status, "parse-failed");
  assert.ok(result.warnings.some((warning) => warning.code === "INVALID_PDF_SIGNATURE"));
});

test("parser orders explicit source coordinates and surfaces editorial warnings", () => {
  const extraction: PrototypeExtraction = {
    metadata: { pageCount: 2 },
    blocks: [
      {
        id: "second",
        sourcePage: 2,
        orderOnPage: 1,
        confidence: 0.72,
        block: {
          type: "image",
          id: "second",
          src: "/images/chart.png",
          alt: "",
          width: 800,
          height: 500,
        },
      },
      {
        id: "first",
        sourcePage: 1,
        orderOnPage: 1,
        confidence: 0.99,
        block: {
          type: "paragraph",
          id: "first",
          content: [{ text: "Opening analysis." }],
        },
      },
    ],
    unsupported: [{ sourcePage: 2, orderOnPage: 2, description: "floating chart note" }],
  };
  const result = runParserPrototype(
    input,
    extraction,
    "2026-08-04T12:01:00.000Z",
  );
  assert.equal(result.status, "draft");
  assert.deepEqual(result.blocks.map((block) => block.id), ["first", "second"]);
  const warningCodes = new Set(result.warnings.map((warning) => warning.code));
  assert.ok(warningCodes.has("UNCERTAIN_READING_ORDER"));
  assert.ok(warningCodes.has("LOW_CONFIDENCE_BLOCK"));
  assert.ok(warningCodes.has("MISSING_IMAGE_ALT"));
  assert.ok(warningCodes.has("UNSUPPORTED_STRUCTURE"));
});

test("all supplied representative reports remain registered as parser fixtures", () => {
  assert.equal(representativeReportFixtures.length, 5);
  assert.deepEqual(
    new Set(representativeReportFixtures.map((fixture) => fixture.pageSize)),
    new Set(["A4", "US Letter"]),
  );
  assert.ok(
    representativeReportFixtures.some((fixture) =>
      fixture.expectedElements.includes("table"),
    ),
  );
});

test("persisted parser blocks require complete safe shapes", () => {
  assert.equal(
    validateArticleBlocks([
      {
        type: "paragraph",
        id: "safe-paragraph",
        content: [{ text: "Source-backed text", href: "https://example.com/source" }],
      },
    ]),
    true,
  );
  assert.equal(
    validateArticleBlocks([
      {
        type: "paragraph",
        id: "unsafe-link",
        content: [{ text: "Click", href: "javascript:alert(1)" }],
      },
    ]),
    false,
  );
  assert.equal(
    validateArticleBlocks([{ type: "image", id: "missing-image-shape", src: "/x.png" }]),
    false,
  );
  assert.equal(
    validateArticleBlocks([{ type: "image", id: "unsafe-image", src: "http://example.com/x.png", alt: "Chart", width: 800, height: 500 }]),
    false,
  );
  assert.equal(
    validateArticleBlocks([{ type: "table", id: "ragged-table", headers: ["A", "B"], rows: [["one"]] }]),
    false,
  );
});
