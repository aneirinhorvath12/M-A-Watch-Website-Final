import type { ParserFixture } from "../contract";

/**
 * Acceptance fixtures supplied by M&A Watch. Three are copied to /public for
 * the prototype UI; all five remain part of the parser acceptance set.
 */
export const representativeReportFixtures: readonly ParserFixture[] = [
  {
    id: "amd-zt-systems",
    filename: "AMD - ZT Systems.pdf",
    publicPath: "/sample-reports/amd-zt-systems.pdf",
    pageCount: 15,
    pageSize: "A4",
    expectedElements: [
      "heading",
      "paragraph",
      "link",
      "table",
      "references",
      "page-spanning-text",
    ],
    editorialNotes: [
      "The PDF does not expose a reliable document-title metadata value.",
      "Compare valuation-table reading order with the approved source.",
    ],
  },
  {
    id: "celsius-alani-nu",
    filename: "Celsius Alani Nu.pdf",
    publicPath: "/sample-reports/celsius-alani-nu.pdf",
    pageCount: 8,
    pageSize: "A4",
    expectedElements: [
      "heading",
      "paragraph",
      "list",
      "link",
      "image",
      "caption",
      "table",
      "references",
    ],
    editorialNotes: ["Require human-written alternative text for extracted deal graphics."],
  },
  {
    id: "oxford-pif-ea",
    filename: "Oxford-PIF-EA-deal-report-FINAL.pdf",
    publicPath: "/sample-reports/oxford-pif-ea.pdf",
    pageCount: 16,
    pageSize: "A4",
    expectedElements: [
      "heading",
      "paragraph",
      "list",
      "link",
      "image",
      "caption",
      "table",
      "references",
      "page-spanning-text",
    ],
    editorialNotes: ["Exercise the longest representative document and dense visual pages."],
  },
  {
    id: "camsif-ma-watch",
    filename: "CAMSIF M&A Watch .pdf",
    publicPath: "/sample-reports/camsif-ma-watch.pdf",
    pageCount: 9,
    pageSize: "US Letter",
    expectedElements: ["heading", "paragraph", "image", "caption", "table", "references"],
    editorialNotes: ["Verify non-A4 geometry without changing logical reading order."],
  },
  {
    id: "ma-watch-report-final",
    filename: "M&A Watch Report - Final.pdf",
    publicPath: "/sample-reports/ma-watch-report-final.pdf",
    pageCount: 16,
    pageSize: "A4",
    expectedElements: [
      "heading",
      "paragraph",
      "list",
      "image",
      "table",
      "references",
      "page-spanning-text",
    ],
    editorialNotes: ["Check that footnotes remain attached to the relevant content block."],
  },
] as const;
