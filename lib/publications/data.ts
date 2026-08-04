import type {
  ArticleBlock,
  ArticlePublication,
  InlineText,
  MarketsPublication,
  Publication,
} from "./types";

const text = (
  value: string,
  options: Omit<InlineText, "text"> = {},
): InlineText => ({ text: value, ...options });

interface DealBodyOptions {
  slug: string;
  acquirer: string;
  target: string;
  sector: string;
  geography: string;
  rationale: string;
  consideration: string;
  risks: string[];
  sources: Array<{ label: string; title: string; href?: string }>;
}

function dealBody(options: DealBodyOptions): ArticleBlock[] {
  return [
    {
      type: "paragraph",
      id: `${options.slug}-standfirst`,
      content: [
        text("Editorial note: ", { marks: ["bold"] }),
        text(
          "This demonstration article shows how an approved PDF becomes an accessible web report. The editorial team can replace every block in the publishing workspace.",
          { marks: ["italic"] },
        ),
      ],
    },
    {
      type: "heading",
      id: `${options.slug}-transaction-overview`,
      level: 2,
      content: [text("Transaction overview")],
    },
    {
      type: "paragraph",
      id: `${options.slug}-overview-copy`,
      content: [
        text(`${options.acquirer} and ${options.target} provide a useful case study in `),
        text(options.sector, { marks: ["bold"] }),
        text(
          `. The report considers the commercial logic, transaction structure and principal execution questions in ${options.geography}.`,
        ),
      ],
    },
    {
      type: "heading",
      id: `${options.slug}-rationale`,
      level: 2,
      content: [text("Strategic rationale")],
    },
    {
      type: "paragraph",
      id: `${options.slug}-rationale-copy`,
      content: [text(options.rationale)],
    },
    {
      type: "list",
      id: `${options.slug}-rationale-list`,
      ordered: false,
      items: [
        [text("Portfolio fit and access to new customer groups.")],
        [text("Operational capabilities that would take longer to build organically.")],
        [text("A clearer route to scale, subject to disciplined integration.")],
      ],
    },
    {
      type: "heading",
      id: `${options.slug}-valuation`,
      level: 2,
      content: [text("Valuation and structure")],
    },
    {
      type: "paragraph",
      id: `${options.slug}-consideration`,
      content: [
        text(options.consideration),
        text(
          " Figures in this sample are illustrative presentation content and must be reconciled to the approved source before launch.",
          { marks: ["italic"] },
        ),
      ],
    },
    {
      type: "table",
      id: `${options.slug}-valuation-table`,
      caption: "Illustrative transaction overview",
      headers: ["Measure", "Illustrative value", "Editorial treatment"],
      rows: [
        ["Headline consideration", "See approved report", "Verify against source PDF"],
        ["Funding", "Mixed / transaction-specific", "Retain source terminology"],
        ["Completion", "Subject to conditions", "Update when status changes"],
      ],
    },
    {
      type: "heading",
      id: `${options.slug}-execution`,
      level: 2,
      content: [text("Execution considerations")],
    },
    {
      type: "paragraph",
      id: `${options.slug}-execution-copy`,
      content: [
        text(
          "The investment case depends on both completion and post-close delivery. The editorial review should keep factual reporting distinct from analysis and identify assumptions clearly.",
        ),
      ],
    },
    {
      type: "list",
      id: `${options.slug}-risk-list`,
      ordered: true,
      items: options.risks.map((risk) => [text(risk)]),
    },
    {
      type: "quote",
      id: `${options.slug}-quote`,
      content: [
        text(
          "A strong transaction thesis is only the beginning; value is realised through clear conditions, credible financing and careful integration.",
        ),
      ],
      attribution: "M&A Watch editorial principle",
    },
    { type: "divider", id: `${options.slug}-divider` },
    {
      type: "references",
      id: `${options.slug}-references`,
      title: "References and further reading",
      entries: options.sources,
    },
  ];
}

const sharedDates = {
  createdAt: "2026-01-08T09:00:00.000Z",
  updatedAt: "2026-07-24T14:30:00.000Z",
};

const strategicPublications: ArticlePublication[] = [
  {
    ...sharedDates,
    id: "pub-strategic-amd-zt",
    type: "strategic",
    title: "AMD’s acquisition of ZT Systems",
    slug: "amd-acquisition-zt-systems",
    summary:
      "A strategic review of AMD’s expansion in AI infrastructure, the role of systems capability and the questions that shape value creation.",
    publicationDate: "2026-06-16",
    status: "published",
    visibility: "enabled",
    authors: ["Matthew Doel"],
    chapter: "University of Oxford",
    featured: true,
    pdfUrl: "/sample-reports/amd-zt-systems.pdf",
    pdfFilename: "AMD - ZT Systems.pdf",
    placeholderContent: true,
    searchKeywords: ["semiconductors", "AI infrastructure", "technology", "United States"],
    publishedAt: "2026-06-16T08:00:00.000Z",
    parserVersion: "prototype-1.0",
    parseWarnings: [],
    structured: {
      acquirer: "AMD",
      target: "ZT Systems",
      sector: "Technology",
      geography: "United States",
      dealStatus: "Completed",
    },
    body: dealBody({
      slug: "amd-zt",
      acquirer: "AMD",
      target: "ZT Systems",
      sector: "AI infrastructure and semiconductor systems",
      geography: "the United States",
      rationale:
        "The transaction can be read as an attempt to bring systems expertise closer to AMD’s accelerated-computing portfolio. The central question is whether that capability shortens deployment cycles and strengthens the proposition offered to large data-centre customers.",
      consideration:
        "The analysis separates headline consideration from the value retained, divested or realised through subsequent restructuring.",
      risks: [
        "Preserving customer neutrality while integrating systems expertise.",
        "Delivering the planned operating model within the stated timetable.",
        "Managing regulatory, supply-chain and concentration exposure.",
      ],
      sources: [
        { label: "1", title: "Original M&A Watch report", href: "/sample-reports/amd-zt-systems.pdf" },
        { label: "2", title: "Company announcements and public filings" },
      ],
    }),
  },
  {
    ...sharedDates,
    id: "pub-strategic-celsius-alani",
    type: "strategic",
    title: "Celsius Holdings’ acquisition of Alani Nu",
    slug: "celsius-acquisition-alani-nu",
    summary:
      "How a fast-growing energy-drink platform can broaden its audience while managing brand overlap, distribution and integration risk.",
    publicationDate: "2026-04-28",
    status: "published",
    visibility: "enabled",
    authors: ["Jonah Yearwood"],
    chapter: "London School of Economics",
    featured: true,
    pdfUrl: "/sample-reports/celsius-alani-nu.pdf",
    pdfFilename: "Celsius Alani Nu.pdf",
    placeholderContent: true,
    searchKeywords: ["consumer", "beverages", "brand portfolio", "distribution"],
    publishedAt: "2026-04-28T08:00:00.000Z",
    parserVersion: "prototype-1.0",
    parseWarnings: ["One complex visual requires an editorial alt-text review."],
    structured: {
      acquirer: "Celsius Holdings",
      target: "Alani Nu",
      sector: "Consumer and beverages",
      geography: "United States",
      dealStatus: "Announced",
    },
    body: dealBody({
      slug: "celsius-alani",
      acquirer: "Celsius Holdings",
      target: "Alani Nu",
      sector: "consumer beverages",
      geography: "the United States",
      rationale:
        "Alani Nu adds a distinctive customer proposition and distribution opportunity. The strategic case rests on retaining the strength of both brands while using shared capabilities to improve reach and execution.",
      consideration:
        "The report evaluates headline value alongside the expected contribution of revenue growth, channel expansion and integration costs.",
      risks: [
        "Protecting differentiated brand identities.",
        "Avoiding channel conflict and customer cannibalisation.",
        "Converting distribution opportunity into durable demand.",
      ],
      sources: [
        { label: "1", title: "Original M&A Watch report", href: "/sample-reports/celsius-alani-nu.pdf" },
        { label: "2", title: "Public company materials and transaction announcements" },
      ],
    }),
  },
  {
    ...sharedDates,
    id: "pub-strategic-ea",
    type: "strategic",
    title: "The PIF-led consortium and Electronic Arts",
    slug: "pif-led-consortium-electronic-arts",
    summary:
      "An examination of private ownership, intellectual-property value and financing considerations in a large interactive-entertainment transaction.",
    publicationDate: "2026-02-12",
    status: "published",
    visibility: "enabled",
    authors: ["Ben Clarke"],
    chapter: "University of Oxford",
    featured: false,
    pdfUrl: "/sample-reports/oxford-pif-ea.pdf",
    pdfFilename: "Oxford-PIF-EA-deal-report-FINAL.pdf",
    placeholderContent: true,
    searchKeywords: ["gaming", "private equity", "Saudi Arabia", "intellectual property"],
    publishedAt: "2026-02-12T09:00:00.000Z",
    parserVersion: "prototype-1.0",
    parseWarnings: [],
    structured: {
      acquirer: "PIF-led consortium",
      target: "Electronic Arts",
      sector: "Media and entertainment",
      geography: "Global",
      dealStatus: "Proposed",
    },
    body: dealBody({
      slug: "pif-ea",
      acquirer: "a PIF-led consortium",
      target: "Electronic Arts",
      sector: "interactive entertainment",
      geography: "global markets",
      rationale:
        "The thesis centres on the longevity of established franchises, recurring player communities and the flexibility of a long-duration ownership model. It must also account for the hit-driven nature of the sector and the cost of sustaining creative pipelines.",
      consideration:
        "The financing discussion tests leverage, cash generation and strategic-owner participation against a range of operating outcomes.",
      risks: [
        "Maintaining creative and operational independence.",
        "Balancing investment in new titles with established franchises.",
        "Managing financing obligations through variable release cycles.",
      ],
      sources: [
        { label: "1", title: "Original M&A Watch report", href: "/sample-reports/oxford-pif-ea.pdf" },
        { label: "2", title: "Public transaction materials" },
      ],
    }),
  },
  {
    ...sharedDates,
    id: "pub-strategic-scheduled",
    type: "strategic",
    title: "European infrastructure transactions: autumn outlook",
    slug: "european-infrastructure-autumn-outlook",
    summary: "A scheduled editorial package that must remain private until publication.",
    publicationDate: "2026-09-03",
    status: "scheduled",
    scheduledFor: "2026-09-03T07:00:00.000Z",
    visibility: "enabled",
    authors: ["M&A Watch Research"],
    chapter: "National Team",
    featured: false,
    pdfUrl: "/sample-reports/amd-zt-systems.pdf",
    pdfFilename: "scheduled-report.pdf",
    placeholderContent: true,
    searchKeywords: ["infrastructure"],
    parserVersion: "prototype-1.0",
    parseWarnings: [],
    structured: { sector: "Infrastructure", geography: "Europe" },
    body: [],
  },
];

const legalPublications: ArticlePublication[] = [
  {
    ...sharedDates,
    id: "pub-legal-fdi",
    type: "legal",
    title: "Foreign investment review and deal certainty",
    slug: "foreign-investment-review-deal-certainty",
    summary:
      "A practical primer on building regulatory timing, information obligations and completion risk into cross-border transaction planning.",
    publicationDate: "2026-07-10",
    status: "published",
    visibility: "enabled",
    authors: ["M&A Watch Legal"],
    chapter: "National Legal Team",
    featured: true,
    pdfUrl: "/sample-reports/oxford-pif-ea.pdf",
    pdfFilename: "Legal briefing - foreign investment review.pdf",
    placeholderContent: true,
    searchKeywords: ["foreign investment", "regulatory", "cross-border", "completion"],
    publishedAt: "2026-07-10T08:30:00.000Z",
    parserVersion: "prototype-1.0",
    parseWarnings: [],
    structured: {
      sector: "Cross-sector",
      geography: "United Kingdom and Europe",
      dealStatus: "Legal briefing",
    },
    body: dealBody({
      slug: "legal-fdi",
      acquirer: "cross-border investors",
      target: "strategic assets",
      sector: "foreign investment review",
      geography: "the United Kingdom and Europe",
      rationale:
        "A credible timetable now requires foreign-investment analysis at the outset. Parties should identify jurisdictional touchpoints, information requirements and the allocation of regulatory risk before signing.",
      consideration:
        "Transaction documents can allocate timing and remedy exposure, but drafting cannot substitute for a realistic assessment of the review process.",
      risks: [
        "Incomplete early mapping of filing obligations.",
        "Long-stop dates that do not reflect review timelines.",
        "Ambiguity over remedies, cooperation and information control.",
      ],
      sources: [
        { label: "1", title: "Demonstration source PDF", href: "/sample-reports/oxford-pif-ea.pdf" },
        { label: "2", title: "Relevant regulator guidance; confirm before publication" },
      ],
    }),
  },
  {
    ...sharedDates,
    id: "pub-legal-merger-control",
    type: "legal",
    title: "Merger control in digital markets",
    slug: "merger-control-digital-markets",
    summary:
      "What transaction teams should consider when market definition, data, ecosystems and nascent competition affect the review.",
    publicationDate: "2026-05-02",
    status: "published",
    visibility: "enabled",
    authors: ["Amelia Hart", "Dylan Shah"],
    chapter: "Cambridge Chapter",
    featured: false,
    pdfUrl: "/sample-reports/amd-zt-systems.pdf",
    pdfFilename: "Legal briefing - digital markets.pdf",
    placeholderContent: true,
    searchKeywords: ["competition", "merger control", "digital markets", "data"],
    publishedAt: "2026-05-02T08:30:00.000Z",
    parserVersion: "prototype-1.0",
    parseWarnings: [],
    structured: {
      sector: "Technology",
      geography: "United Kingdom and European Union",
      dealStatus: "Legal briefing",
    },
    body: dealBody({
      slug: "legal-digital",
      acquirer: "digital platforms",
      target: "technology businesses",
      sector: "competition law and digital markets",
      geography: "the United Kingdom and European Union",
      rationale:
        "The legal analysis must extend beyond current revenue shares. Data access, ecosystem effects and the potential development of a target may all influence regulatory scrutiny.",
      consideration:
        "Parties should connect the economic theory of the deal to the evidence contained in ordinary-course documents and forecasts.",
      risks: [
        "Inconsistent internal and external descriptions of the rationale.",
        "Underestimating theories involving innovation or nascent competition.",
        "Late preparation for data-intensive information requests.",
      ],
      sources: [
        { label: "1", title: "Demonstration source PDF", href: "/sample-reports/amd-zt-systems.pdf" },
        { label: "2", title: "Competition authority guidance; confirm current version" },
      ],
    }),
  },
  {
    ...sharedDates,
    id: "pub-legal-earnouts",
    type: "legal",
    title: "Drafting earn-outs for uncertain markets",
    slug: "drafting-earn-outs-uncertain-markets",
    summary:
      "A concise guide to performance definitions, operational covenants, information rights and dispute mechanisms in deferred consideration.",
    publicationDate: "2025-11-19",
    status: "published",
    visibility: "enabled",
    authors: ["M&A Watch Legal"],
    chapter: "National Legal Team",
    featured: false,
    pdfUrl: "/sample-reports/celsius-alani-nu.pdf",
    pdfFilename: "Legal briefing - earn-outs.pdf",
    placeholderContent: true,
    searchKeywords: ["earn-out", "deferred consideration", "SPA", "disputes"],
    publishedAt: "2025-11-19T09:00:00.000Z",
    parserVersion: "prototype-1.0",
    parseWarnings: [],
    structured: { sector: "Cross-sector", geography: "United Kingdom", dealStatus: "Legal briefing" },
    body: dealBody({
      slug: "legal-earnouts",
      acquirer: "buyers",
      target: "founder-owned businesses",
      sector: "deferred consideration",
      geography: "the United Kingdom",
      rationale:
        "Earn-outs can bridge a valuation gap, but they also turn post-completion performance into a contractual measurement problem. The drafting should make commercial assumptions operational and testable.",
      consideration:
        "Definitions, accounting policies and permitted operational decisions should work together rather than leaving the headline formula to carry the whole bargain.",
      risks: [
        "Metrics that do not match the way the business is operated.",
        "Unclear buyer obligations during the measurement period.",
        "A dispute process that is slower or broader than intended.",
      ],
      sources: [
        { label: "1", title: "Demonstration source PDF", href: "/sample-reports/celsius-alani-nu.pdf" },
        { label: "2", title: "Editorial legal sources to be inserted" },
      ],
    }),
  },
  {
    ...sharedDates,
    id: "pub-legal-draft",
    type: "legal",
    title: "Warranty and indemnity insurance: editorial draft",
    slug: "warranty-indemnity-insurance-editorial-draft",
    summary: "An unpublished draft that must not be returned by public helpers.",
    publicationDate: "2026-08-20",
    status: "review",
    visibility: "enabled",
    authors: ["M&A Watch Legal"],
    chapter: "National Legal Team",
    featured: false,
    pdfUrl: "/sample-reports/celsius-alani-nu.pdf",
    pdfFilename: "draft-legal-report.pdf",
    placeholderContent: true,
    searchKeywords: ["insurance"],
    parserVersion: "prototype-1.0",
    parseWarnings: ["Editorial review incomplete."],
    structured: { sector: "Insurance" },
    body: [],
  },
];

const marketsPublications: MarketsPublication[] = [
  {
    ...sharedDates,
    id: "pub-markets-july-2026",
    type: "markets",
    title: "Markets briefing — July 2026",
    slug: "markets-briefing-july-2026",
    summary:
      "A demonstration issue for the PDF-reading workflow, covering the themes shaping rates, currencies, commodities and risk appetite.",
    publicationDate: "2026-07-24",
    status: "published",
    visibility: "enabled",
    authors: ["M&A Watch Markets"],
    chapter: "National Markets Team",
    featured: true,
    pdfUrl: "/sample-reports/oxford-pif-ea.pdf",
    pdfFilename: "Markets briefing - July 2026.pdf",
    placeholderContent: true,
    searchKeywords: ["rates", "FX", "commodities", "macro"],
    publishedAt: "2026-07-24T07:00:00.000Z",
    category: "Markets",
  },
  {
    ...sharedDates,
    id: "pub-markets-june-2026",
    type: "markets",
    title: "Markets briefing — June 2026",
    slug: "markets-briefing-june-2026",
    summary:
      "A student-led snapshot of the month’s macro narrative and notable movements across global asset classes.",
    publicationDate: "2026-06-20",
    status: "published",
    visibility: "enabled",
    authors: ["M&A Watch Markets"],
    chapter: "National Markets Team",
    featured: false,
    pdfUrl: "/sample-reports/amd-zt-systems.pdf",
    pdfFilename: "Markets briefing - June 2026.pdf",
    placeholderContent: true,
    searchKeywords: ["equities", "credit", "rates", "macro"],
    publishedAt: "2026-06-20T07:00:00.000Z",
    category: "Markets",
  },
  {
    ...sharedDates,
    id: "pub-markets-may-2026",
    type: "markets",
    title: "Markets briefing — May 2026",
    slug: "markets-briefing-may-2026",
    summary:
      "The month in context: policy expectations, cross-asset signals and questions for the next trading period.",
    publicationDate: "2026-05-22",
    status: "published",
    visibility: "enabled",
    authors: ["M&A Watch Markets"],
    chapter: "National Markets Team",
    featured: false,
    pdfUrl: "/sample-reports/celsius-alani-nu.pdf",
    pdfFilename: "Markets briefing - May 2026.pdf",
    placeholderContent: true,
    searchKeywords: ["policy", "cross-asset", "currencies", "markets"],
    publishedAt: "2026-05-22T07:00:00.000Z",
    category: "Markets",
  },
];

/**
 * Internal prototype store. Public routes must access records through the
 * published-only helpers in service.ts. Admin draft previews use preview.ts.
 */
export const publicationRecords: readonly Publication[] = Object.freeze([
  ...strategicPublications,
  ...legalPublications,
  ...marketsPublications,
]);
