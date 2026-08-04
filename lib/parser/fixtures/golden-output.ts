import type { ParserFixtureGolden } from "../contract";

/**
 * Immutable source and output baselines for the stakeholder-supplied reports.
 * Source hashes make accidental fixture replacement visible. Ordered anchors
 * let any future extraction adapter prove that representative source text was
 * retained in document order without requiring exact whitespace or styling.
 */
export const representativeReportGoldens: readonly ParserFixtureGolden[] = [
  {
    schemaVersion: "1.0",
    fixtureId: "amd-zt-systems",
    sourceSha256: "6b7f06a94960b9ef5dbe3f23042ba2c63f77962a9930a714f59a64b089d18ba7",
    sourceByteLength: 317_401,
    orderedTextAnchors: [
      "Deal Overview",
      "Acquirer Overview Advanced Micro Devices AMD",
      "Performance and Valuation",
      "House View",
      "References",
    ],
    pageChecks: [
      {
        id: "amd-page-12-valuation-table",
        pages: [12],
        requiredElements: ["table"],
        manualReview: "Page 12: verify the compact four-column valuation table retains every header, row and value in an accessible table.",
      },
      {
        id: "amd-pages-14-15-references",
        pages: [14, 15],
        requiredElements: ["references", "link"],
        manualReview: "Pages 14-15: verify the complete references sequence, URLs and page-boundary order against the source.",
      },
    ],
  },
  {
    schemaVersion: "1.0",
    fixtureId: "celsius-alani-nu",
    sourceSha256: "68fcb525da318b7793a4eefbcfe545e5d257093c3ba5c574d7b74981f2cc2251",
    sourceByteLength: 413_813,
    orderedTextAnchors: [
      "Acquirer Overview Celsius Holdings Inc",
      "Target Overview Alani Nutrition",
      "Valuation",
      "Risks",
      "House View",
    ],
    pageChecks: [
      {
        id: "celsius-pages-6-7-valuation-tables",
        pages: [6, 7],
        requiredElements: ["table"],
        manualReview: "Pages 6-7: verify both the DCF and precedent-transaction tables, including headings, units and scenario values.",
      },
    ],
  },
  {
    schemaVersion: "1.0",
    fixtureId: "oxford-pif-ea",
    sourceSha256: "368f7f2e8493430a5451fcddf926683f6cf0b7842264799d4bbc96add869b69a",
    sourceByteLength: 1_018_761,
    orderedTextAnchors: [
      "PIF's $55bn acquisition of EA",
      "Deal overview",
      "Target Overview",
      "Performance and Valuation",
      "House View",
    ],
    pageChecks: [
      {
        id: "oxford-pages-12-13-dense-figures",
        pages: [12, 13],
        requiredElements: ["image"],
        manualReview: "Pages 12-13: preserve the dense DCF/comparables figures as figures with human-written alt text; provide an accessible table or equivalent text for values rather than treating pixels as an accessible table.",
      },
      {
        id: "oxford-pages-14-15-spanning-risk-table",
        pages: [14, 15],
        requiredElements: ["table"],
        manualReview: "Pages 14-15: verify the risk matrix remains one logical table across the page break with no duplicated, dropped or reordered rows.",
      },
    ],
  },
  {
    schemaVersion: "1.0",
    fixtureId: "camsif-ma-watch",
    sourceSha256: "183bfb9a8a7140a47200a327dcb04b71b88972da604feb621b58e02990e1627f",
    sourceByteLength: 585_048,
    orderedTextAnchors: [
      "Nintendo's Acquisition of CRI Middleware",
      "Acquirer Overview Nintendo",
      "Target Overview CRI Middleware",
      "Performance and Valuation",
      "House View",
    ],
    pageChecks: [
      {
        id: "camsif-pages-6-8-scenario-tables",
        pages: [6, 7, 8],
        requiredElements: ["table"],
        manualReview: "Pages 6-8: verify embedded sensitivity and scenario tables retain labels, values and their relationship to the surrounding valuation analysis.",
      },
    ],
  },
  {
    schemaVersion: "1.0",
    fixtureId: "ma-watch-report-final",
    sourceSha256: "c34404665b027d92f4b26defa5724cf035db08bc60e766e29dd981dabd39109e",
    sourceByteLength: 703_940,
    orderedTextAnchors: [
      "Pfizer's $10bn Acquisition of Metsera",
      "Deal Overview",
      "Performance and Valuation",
      "House View",
      "References",
    ],
    pageChecks: [
      {
        id: "final-report-page-11-peer-table",
        pages: [11],
        requiredElements: ["table"],
        manualReview: "Page 11: verify the peer-comparison table retains each company, metric, unit and column association.",
      },
      {
        id: "final-report-pages-14-15-references",
        pages: [14, 15],
        requiredElements: ["references", "link"],
        manualReview: "Pages 14-15: verify the complete references list and URLs remain in source order across the page break.",
      },
    ],
  },
] as const;
