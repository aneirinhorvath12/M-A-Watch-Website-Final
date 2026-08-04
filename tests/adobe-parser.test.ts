import assert from "node:assert/strict";
import test from "node:test";
import { zipSync } from "fflate";
import {
  AdobeParserAdapterError,
  pollAdobeExtractJob,
  startAdobeExtractJob,
  type AdobeExtractJobState,
} from "../lib/parser/adobe/client";
import { resolveAdobeParserConfig } from "../lib/parser/adobe/config";
import {
  AdobeStructuredDataError,
  mapAdobeStructuredData,
} from "../lib/parser/adobe/mapper";
import { adobeCompletionToParserResult } from "../lib/parser/adobe/result";
import type { ParserInput } from "../lib/parser/contract";

const euConfig = resolveAdobeParserConfig({
  ADOBE_PDF_SERVICES_CLIENT_ID: "client-id",
  ADOBE_PDF_SERVICES_CLIENT_SECRET: "client-secret",
  ADOBE_PDF_SERVICES_REGION: "eu",
});
assert.ok(euConfig);

const submittedState: AdobeExtractJobState = {
  schemaVersion: "1",
  provider: "adobe-pdf-services",
  phase: "polling",
  pollingUrl:
    "https://pdf-services-ew1.adobe.io/operation/extractpdf/job-123/status",
  inputAssetId: "urn:aaid:AS:EU:asset-123",
  submittedAt: "2026-08-04T12:00:00.000Z",
  pollCount: 0,
  notBefore: "2026-08-04T12:00:05.000Z",
};

test("Adobe config requires credentials and an explicit processing region", () => {
  assert.equal(
    resolveAdobeParserConfig({
      ADOBE_PDF_SERVICES_CLIENT_ID: "client-id",
      ADOBE_PDF_SERVICES_CLIENT_SECRET: "client-secret",
    }),
    null,
  );
  assert.equal(euConfig.tokenUrl, "https://pdf-services.adobe.io/token");
  assert.equal(euConfig.baseUrl, "https://pdf-services-ew1.adobe.io");
  const us = resolveAdobeParserConfig({
    ADOBE_PDF_SERVICES_CLIENT_ID: " client-id ",
    ADOBE_PDF_SERVICES_CLIENT_SECRET: " client-secret ",
    ADOBE_PDF_SERVICES_REGION: "US",
  });
  assert.equal(us?.baseUrl, "https://pdf-services-ue1.adobe.io");
});

test("Adobe submission uploads and submits without synchronously polling", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const responses = [
    jsonResponse({ access_token: "access-token", expires_in: 3600 }),
    jsonResponse({
      assetID: "urn:aaid:AS:EU:asset-123",
      uploadUri:
        "https://dcplatformstorageservice-prod-eu-west-1.s3.amazonaws.com/input?signature=test",
    }),
    new Response(null, { status: 200 }),
    new Response(null, {
      status: 201,
      headers: {
        location:
          "https://pdf-services-ew1.adobe.io/operation/extractpdf/job-123/status",
        "retry-after": "7",
      },
    }),
  ];
  const fetch = mockResponses(responses, requests);
  const result = await startAdobeExtractJob(
    euConfig,
    new TextEncoder().encode("%PDF-1.7"),
    { fetch, now: () => new Date("2026-08-04T12:00:00.000Z") },
  );

  assert.equal(result.kind, "pending");
  assert.equal(result.retryAfterMs, 7_000);
  assert.equal(result.state.notBefore, "2026-08-04T12:00:07.000Z");
  assert.deepEqual(
    requests.map((request) => [request.init?.method, request.url]),
    [
      ["POST", "https://pdf-services.adobe.io/token"],
      ["POST", "https://pdf-services-ew1.adobe.io/assets"],
      [
        "PUT",
        "https://dcplatformstorageservice-prod-eu-west-1.s3.amazonaws.com/input?signature=test",
      ],
      ["POST", "https://pdf-services-ew1.adobe.io/operation/extractpdf"],
    ],
  );
  const submitBody = JSON.parse(String(requests[3].init?.body));
  assert.deepEqual(submitBody, {
    assetID: "urn:aaid:AS:EU:asset-123",
    elementsToExtract: ["text", "tables"],
    renditionsToExtract: ["figures"],
    includeStyling: true,
  });
  assert.equal(
    new Headers(requests[3].init?.headers).get("authorization"),
    "Bearer access-token",
  );
});

test("Adobe polling performs at most one status request and honours Retry-After", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const result = await pollAdobeExtractJob(euConfig, submittedState, {
    fetch: mockResponses(
      [
        jsonResponse({ access_token: "access-token", expires_in: 3600 }),
        jsonResponse(
          { status: "in progress" },
          { headers: { "retry-after": "17" } },
        ),
      ],
      requests,
    ),
    now: () => new Date("2026-08-04T12:00:05.000Z"),
  });
  assert.equal(result.kind, "pending");
  if (result.kind !== "pending") return;
  assert.equal(result.retryAfterMs, 17_000);
  assert.equal(result.state.pollCount, 1);
  assert.equal(result.state.notBefore, "2026-08-04T12:00:22.000Z");
  assert.equal(requests.length, 2, "token plus exactly one status request");

  let earlyFetches = 0;
  const early = await pollAdobeExtractJob(euConfig, result.state, {
    fetch: (async () => {
      earlyFetches += 1;
      throw new Error("must not fetch before notBefore");
    }) as typeof fetch,
    now: () => new Date("2026-08-04T12:00:10.000Z"),
  });
  assert.equal(early.kind, "pending");
  assert.equal(earlyFetches, 0);
});

for (const downloadField of ["downloadUri", "downloadURI"] as const) {
  test(`Adobe completion accepts the documented ${downloadField} content asset`, async () => {
    const downloadUrl =
      "https://dcplatformstorageservice-prod-eu-west-1.s3.amazonaws.com/content?signature=test";
    const resourceUrl =
      "https://dcplatformstorageservice-prod-eu-west-1.s3.amazonaws.com/resource?signature=test";
    const result = await pollAdobeExtractJob(euConfig, submittedState, {
      fetch: mockResponses([
        jsonResponse({ access_token: "access-token", expires_in: 3600 }),
        jsonResponse({
          status: "done",
          content: { [downloadField]: downloadUrl },
          resource: { downloadUri: resourceUrl },
        }),
        jsonResponse(structuredData()),
        new Response(figureArchive().buffer as ArrayBuffer, {
          headers: { "content-type": "application/zip" },
        }),
      ]),
      now: () => new Date("2026-08-04T12:00:05.000Z"),
    });
    assert.equal(result.kind, "complete");
    if (result.kind !== "complete") return;
    assert.match(result.parserVersion, /^adobe-pdf-extract-1\.1\.0/);
    assert.equal(result.figureRenditions.length, 1);
    assert.deepEqual(
      {
        path: result.figureRenditions[0].path,
        width: result.figureRenditions[0].width,
        height: result.figureRenditions[0].height,
      },
      { path: "figures/figure1.png", width: 2, height: 3 },
    );
    assert.deepEqual(
      result.extraction.blocks.map((block) => block.block.type),
      ["heading", "paragraph", "list", "table", "references"],
    );
  });
}

test("Adobe completion rejects ambiguous or untrusted content assets", async () => {
  await assert.rejects(
    () =>
      pollAdobeExtractJob(euConfig, submittedState, {
        fetch: mockResponses([
          jsonResponse({ access_token: "access-token" }),
          jsonResponse({
            status: "done",
            content: {
              downloadUri:
                "https://dcplatformstorageservice-prod-eu-west-1.s3.amazonaws.com/a",
              downloadURI:
                "https://dcplatformstorageservice-prod-eu-west-1.s3.amazonaws.com/b",
            },
          }),
        ]),
        now: () => new Date("2026-08-04T12:00:05.000Z"),
      }),
    (error: unknown) =>
      error instanceof AdobeParserAdapterError &&
      error.code === "INVALID_RESPONSE_SHAPE",
  );
  await assert.rejects(
    () =>
      pollAdobeExtractJob(euConfig, submittedState, {
        fetch: mockResponses([
          jsonResponse({ access_token: "access-token" }),
          jsonResponse({
            status: "done",
            content: { downloadUri: "https://attacker.example/extracted.json" },
          }),
        ]),
        now: () => new Date("2026-08-04T12:00:05.000Z"),
      }),
    (error: unknown) =>
      error instanceof AdobeParserAdapterError &&
      error.code === "UNTRUSTED_STORAGE_URL",
  );
});

test("Adobe completion rejects untrusted rendition assets and unsafe image dimensions", async () => {
  const contentUrl =
    "https://dcplatformstorageservice-prod-eu-west-1.s3.amazonaws.com/content?signature=test";
  await assert.rejects(
    () =>
      pollAdobeExtractJob(euConfig, submittedState, {
        fetch: mockResponses([
          jsonResponse({ access_token: "access-token" }),
          jsonResponse({
            status: "done",
            content: { downloadUri: contentUrl },
            resource: { downloadUri: "https://attacker.example/resource.zip" },
          }),
          jsonResponse(structuredData()),
        ]),
        now: () => new Date("2026-08-04T12:00:05.000Z"),
      }),
    (error: unknown) =>
      error instanceof AdobeParserAdapterError &&
      error.code === "UNTRUSTED_STORAGE_URL",
  );

  const resourceUrl =
    "https://dcplatformstorageservice-prod-eu-west-1.s3.amazonaws.com/resource?signature=test";
  await assert.rejects(
    () =>
      pollAdobeExtractJob(euConfig, submittedState, {
        fetch: mockResponses([
          jsonResponse({ access_token: "access-token" }),
          jsonResponse({
            status: "done",
            content: { downloadUri: contentUrl },
            resource: { downloadUri: resourceUrl },
          }),
          jsonResponse(structuredData()),
          new Response(figureArchive(10_000, 10_000).buffer as ArrayBuffer),
        ]),
        now: () => new Date("2026-08-04T12:00:05.000Z"),
      }),
    (error: unknown) =>
      error instanceof AdobeParserAdapterError &&
      error.code === "INVALID_FIGURE_RENDITION",
  );
});

test("Adobe mapper preserves source text, tables, links and explicit review gates", () => {
  const extraction = mapAdobeStructuredData(structuredData());
  const paragraph = extraction.blocks.find(
    (block) => block.block.type === "paragraph",
  )?.block;
  assert.ok(paragraph?.type === "paragraph");
  assert.deepEqual(paragraph.content, [
    { text: "Source-backed ", marks: ["bold"] },
    { text: "analysis", href: "https://example.com/source" },
  ]);
  const table = extraction.blocks.find((block) => block.block.type === "table")?.block;
  assert.ok(table?.type === "table");
  assert.deepEqual(table.headers, ["Measure", "Value"]);
  assert.deepEqual(table.rows, [["Consideration", "$4.9bn"]]);
  assert.ok(
    extraction.unsupported.some((item) => item.description.includes("alternative text")),
    "figures remain a human-owned managed-image step",
  );

  const withManagedFigure = mapAdobeStructuredData(structuredData(), {
    figureAssets: new Map([
      [
        "figures/figure1.png",
        {
          src: "/api/publications/publication_adobe_test/images/00000000-0000-4000-8000-000000000000.png",
          width: 2,
          height: 3,
        },
      ],
    ]),
  });
  const image = withManagedFigure.blocks.find(
    (block) => block.block.type === "image",
  )?.block;
  assert.ok(image?.type === "image");
  assert.equal(image.alt, "");
  assert.equal(image.width, 2);
  assert.equal(
    withManagedFigure.unsupported.some((item) =>
      item.description.includes("Figure rendition"),
    ),
    false,
  );

  const input: ParserInput = {
    jobId: "job_adobe_test",
    publicationId: "publication_adobe_test",
    publicationType: "strategic",
    filename: "report.pdf",
    mimeType: "application/pdf",
    size: 128,
    bytes: new TextEncoder().encode("%PDF-1.7"),
    requestedAt: "2026-08-04T12:00:00.000Z",
  };
  const result = adobeCompletionToParserResult(
    input,
    {
      kind: "complete",
      extraction,
      parserVersion: "adobe-pdf-extract-1.1.0-structure-test-json-test",
      structuredData: structuredData(),
      figureRenditions: [],
    },
    "2026-08-04T12:01:00.000Z",
  );
  assert.equal(result.status, "draft");
  assert.match(result.parserVersion, /^adobe-pdf-extract/);
  assert.ok(result.warnings.some((warning) => warning.code === "LOW_CONFIDENCE_BLOCK"));
  assert.ok(result.warnings.some((warning) => warning.code === "UNSUPPORTED_STRUCTURE"));
});

test("Adobe mapper fails closed on unapproved schema and merged table cells", () => {
  assert.throws(
    () =>
      mapAdobeStructuredData({
        ...structuredData(),
        version: { schema: "2.0.0" },
      }),
    (error: unknown) =>
      error instanceof AdobeStructuredDataError && error.code === "UNSUPPORTED_SCHEMA",
  );
  const merged = structuredData();
  const table = (merged.elements as Record<string, unknown>[]).find(
    (element) => String(element.Path).endsWith("/Table"),
  );
  assert.ok(table && Array.isArray(table.Kids));
  const firstCell = table.Kids[0] as Record<string, unknown>;
  firstCell.attributes = {
    ...(firstCell.attributes as Record<string, unknown>),
    ColSpan: 2,
  };
  const extraction = mapAdobeStructuredData(merged);
  assert.equal(
    extraction.blocks.some((block) => block.block.type === "table"),
    false,
  );
  assert.ok(
    extraction.unsupported.some((item) => item.description.includes("Merged table cells")),
  );
});

test("Adobe HTTP throttling is classified as retryable without exposing a body", async () => {
  await assert.rejects(
    () =>
      startAdobeExtractJob(euConfig, new TextEncoder().encode("%PDF-1.7"), {
        fetch: mockResponses([new Response("provider detail", { status: 429 })]),
      }),
    (error: unknown) =>
      error instanceof AdobeParserAdapterError &&
      error.code === "AUTHENTICATION_FAILED_429" &&
      error.retryable &&
      !error.message.includes("provider detail"),
  );
});

test("Adobe response limits stop an undeclared oversized stream early", async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(9_000));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    () =>
      startAdobeExtractJob(euConfig, new TextEncoder().encode("%PDF-1.7"), {
        fetch: mockResponses([
          new Response(body, { headers: { "content-type": "application/json" } }),
        ]),
      }),
    (error: unknown) =>
      error instanceof AdobeParserAdapterError &&
      error.code === "RESPONSE_TOO_LARGE",
  );
  assert.equal(cancelled, true, "the adapter cancels the provider stream");
  assert.ok(pulls <= 3, "bounded buffering stops near the configured limit");
});

test("Adobe response-body deadlines cancel a provider stream that stalls after headers", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"access_token":"partial'));
    },
    cancel() {
      cancelled = true;
    },
  });

  await assert.rejects(
    () =>
      startAdobeExtractJob(euConfig, new TextEncoder().encode("%PDF-1.7"), {
        fetch: mockResponses([
          new Response(body, { headers: { "content-type": "application/json" } }),
        ]),
        requestTimeoutMs: 20,
      }),
    (error: unknown) =>
      error instanceof AdobeParserAdapterError &&
      error.code === "RESPONSE_BODY_TIMEOUT" &&
      error.retryable,
  );
  assert.equal(cancelled, true, "the stalled provider body is cancelled");
});

function structuredData(): Record<string, unknown> {
  return {
    version: {
      schema: "1.1.0",
      structure: "test-structure",
      page_segmentation: "test-pages",
      json_export: "test-json",
    },
    extended_metadata: { page_count: 2 },
    pages: [
      { page_number: 0 },
      { page_number: 1 },
    ],
    elements: [
      { Path: "//Document/Title", Page: 0, Text: "Deal Overview" },
      {
        Path: "//Document/Sect/P",
        Page: 0,
        Kids: [
          {
            Path: "//Document/Sect/P/StyleSpan",
            Text: "Source-backed ",
            Font: { weight: 700, italic: false },
          },
          {
            Path: "//Document/Sect/P/Reference",
            Text: "analysis",
            Reference: "https://example.com/source",
          },
        ],
      },
      {
        Path: "//Document/Sect/L",
        Page: 0,
        Kids: [
          {
            Path: "//Document/Sect/L/Li",
            Kids: [
              { Path: "//Document/Sect/L/Li/Lbl", Text: "1." },
              { Path: "//Document/Sect/L/Li/LBody", Text: "First item" },
            ],
          },
          {
            Path: "//Document/Sect/L/Li[2]",
            Kids: [
              { Path: "//Document/Sect/L/Li[2]/Lbl", Text: "2." },
              { Path: "//Document/Sect/L/Li[2]/LBody", Text: "Second item" },
            ],
          },
        ],
      },
      {
        Path: "//Document/Sect/Table",
        Page: 1,
        attributes: { NumRow: 2, NumCol: 2 },
        Kids: [
          tableCell("TH", 0, 0, "Measure"),
          tableCell("TH[2]", 0, 1, "Value"),
          tableCell("TD", 1, 0, "Consideration"),
          tableCell("TD[2]", 1, 1, "$4.9bn"),
        ],
      },
      {
        Path: "//Document/Sect/Figure",
        Page: 1,
        filePaths: ["figures/figure1.png"],
      },
      { Path: "//Document/Sect/H2", Page: 1, Text: "References" },
      {
        Path: "//Document/Sect/P[2]",
        Page: 1,
        Kids: [
          { Text: "1. Adobe source", Reference: "https://example.com/adobe" },
        ],
      },
    ],
  };
}

function figureArchive(width = 2, height = 3): Uint8Array {
  const png = new Uint8Array(33);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(8, 13);
  png.set(new TextEncoder().encode("IHDR"), 12);
  new DataView(png.buffer).setUint32(16, width);
  new DataView(png.buffer).setUint32(20, height);
  png.set([8, 6, 0, 0, 0], 24);
  return zipSync({
    "structuredData.json": new TextEncoder().encode("{}"),
    "figures/figure1.png": png,
  });
}

function tableCell(
  type: string,
  row: number,
  column: number,
  text: string,
): Record<string, unknown> {
  return {
    Path: `//Document/Sect/Table/TR[${row + 1}]/${type}`,
    Page: 1,
    Text: text,
    attributes: { RowIndex: row, ColIndex: column, RowSpan: 1, ColSpan: 1 },
  };
}

function jsonResponse(
  value: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function mockResponses(
  responses: Response[],
  requests: { url: string; init?: RequestInit }[] = [],
): typeof fetch {
  let index = 0;
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    requests.push({ url, init });
    const response = responses[index];
    index += 1;
    if (!response) throw new Error(`Unexpected fetch: ${url}`);
    return response;
  }) as typeof fetch;
}
