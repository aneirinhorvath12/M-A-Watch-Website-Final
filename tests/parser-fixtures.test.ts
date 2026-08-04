import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { evaluateParserFixture } from "../lib/parser/fixture-acceptance";
import { representativeReportGoldens } from "../lib/parser/fixtures/golden-output";
import { representativeReportFixtures } from "../lib/parser/fixtures/representative-reports";
import type { ParsedBlock, ParserResult } from "../lib/parser/contract";

test("representative parser PDFs are immutable, complete binary fixtures", async () => {
  const goldenById = new Map(representativeReportGoldens.map((golden) => [golden.fixtureId, golden]));
  assert.deepEqual(
    new Set(goldenById.keys()),
    new Set(representativeReportFixtures.map((fixture) => fixture.id)),
  );

  for (const fixture of representativeReportFixtures) {
    assert.ok(fixture.publicPath, `${fixture.id} must have a checked-in source PDF`);
    const golden = goldenById.get(fixture.id);
    assert.ok(golden, `${fixture.id} must have a golden baseline`);
    assert.equal(golden.schemaVersion, "1.0");
    assert.ok(golden.orderedTextAnchors.length >= 4);
    assert.ok(golden.pageChecks.length >= 1);
    assert.ok(golden.pageChecks.every((check) => check.manualReview.length > 40));

    const bytes = await readFile(resolve(process.cwd(), "public", fixture.publicPath.slice(1)));
    assert.equal(bytes.byteLength, golden.sourceByteLength, `${fixture.id} byte length changed`);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      golden.sourceSha256,
      `${fixture.id} source hash changed`,
    );
    assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-", `${fixture.id} lost its PDF header`);
    assert.match(bytes.subarray(-2_048).toString("latin1"), /%%EOF/, `${fixture.id} has no PDF EOF marker`);
  }
});

test("golden acceptance checks structure, source order, anchors and manual gates", () => {
  const fixture = representativeReportFixtures.find((item) => item.id === "amd-zt-systems");
  const golden = representativeReportGoldens.find((item) => item.fixtureId === fixture?.id);
  assert.ok(fixture);
  assert.ok(golden);

  const blocks: ParsedBlock[] = [
    {
      id: "overview",
      sourcePage: 1,
      orderOnPage: 0,
      confidence: 0.99,
      block: { type: "heading", id: "overview", level: 2, content: [{ text: "Deal Overview" }] },
    },
    {
      id: "acquirer",
      sourcePage: 2,
      orderOnPage: 0,
      confidence: 0.98,
      block: {
        type: "paragraph",
        id: "acquirer",
        content: [{ text: "Acquirer Overview: Advanced Micro Devices (AMD)", href: "https://example.com/source" }],
      },
    },
    {
      id: "valuation",
      sourcePage: 12,
      orderOnPage: 0,
      confidence: 0.96,
      block: {
        type: "table",
        id: "valuation",
        caption: "Performance & Valuation",
        headers: ["Measure", "Value"],
        rows: [["Headline consideration", "$4.9 billion"]],
      },
    },
    {
      id: "house-view",
      sourcePage: 14,
      orderOnPage: 0,
      confidence: 0.98,
      block: { type: "paragraph", id: "house-view", content: [{ text: "House View" }] },
    },
    {
      id: "references",
      sourcePage: 15,
      orderOnPage: 0,
      confidence: 0.99,
      block: {
        type: "references",
        id: "references",
        title: "References",
        entries: [{ label: "1", title: "AMD investor relations", href: "https://example.com/amd" }],
      },
    },
  ];
  const result: ParserResult = {
    contractVersion: "1.0.0",
    parserVersion: "fixture-adapter-1.0.0",
    jobId: "job_fixture_amd",
    publicationId: fixture.id,
    status: "draft",
    blocks,
    warnings: [],
    metadata: { pageCount: fixture.pageCount },
    completedAt: "2026-08-04T12:00:00.000Z",
  };

  const accepted = evaluateParserFixture(fixture, golden, result);
  assert.equal(accepted.automatedChecksPassed, true, accepted.failures.join("\n"));
  assert.ok(accepted.manualChecks.some((check) => check.includes("page-spanning")));

  const rejected = evaluateParserFixture(fixture, golden, {
    ...result,
    metadata: { pageCount: 1 },
    blocks: blocks.slice().reverse(),
  });
  assert.equal(rejected.automatedChecksPassed, false);
  assert.ok(rejected.failures.some((failure) => failure.includes("source order")));
  assert.ok(rejected.failures.some((failure) => failure.includes("15 pages")));

  const misplacedTable = evaluateParserFixture(fixture, golden, {
    ...result,
    blocks: blocks.map((block) =>
      block.id === "valuation" ? { ...block, sourcePage: 10 } : block,
    ),
  });
  assert.equal(misplacedTable.automatedChecksPassed, false);
  assert.ok(
    misplacedTable.failures.some((failure) =>
      failure.includes("amd-page-12-valuation-table"),
    ),
  );
});
