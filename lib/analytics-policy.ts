export const ANALYTICS_RETENTION_DAYS = 400;

const PAGE_VALUES = [
  "home",
  "reports_listing",
  "strategic_listing",
  "legal_listing",
  "markets_listing",
  "report_detail",
  "application",
  "application_confirmation",
  "team",
  "information",
  "privacy",
  "terms",
  "accessibility",
  "other_public",
] as const;

const COLLECTION_VALUES = ["all", "strategic", "legal", "markets"] as const;
const PUBLICATION_TYPES = ["strategic", "legal", "markets"] as const;
const FILTER_VALUES = COLLECTION_VALUES.flatMap((collection) =>
  (["apply", "reset", "pagination"] as const).map(
    (action) => `${action}:${collection}` as const,
  ),
);
const VALIDATION_FAILURE_VALUES = [
  "client_validation",
  "server_validation",
  "upload_validation",
  "policy_unavailable",
  "network",
] as const;

const EVENT_POLICY = {
  page_view: { dimension: "page", values: PAGE_VALUES },
  publication_search: { dimension: "collection", values: COLLECTION_VALUES },
  publication_filter: { dimension: "interaction", values: FILTER_VALUES },
  report_web_view: { dimension: "publication_type", values: PUBLICATION_TYPES },
  report_pdf_view: { dimension: "publication_type", values: PUBLICATION_TYPES },
  report_pdf_download: { dimension: "publication_type", values: PUBLICATION_TYPES },
  application_page_view: null,
  application_submit_success: null,
  application_validation_failure: {
    dimension: "failure_kind",
    values: VALIDATION_FAILURE_VALUES,
  },
} as const;

export type AnalyticsEventName = keyof typeof EVENT_POLICY;
export type AnalyticsClientEvent = {
  event: AnalyticsEventName;
  value?: string;
};

export type SanitisedAnalyticsEvent = {
  event: AnalyticsEventName;
  dimensionName: string;
  dimensionValue: string;
};

/**
 * Accept only the two-field aggregate analytics envelope. Unknown fields are
 * rejected rather than stripped so a future caller cannot accidentally send
 * form values, URLs or identifiers that are silently ignored at the edge.
 */
export function sanitiseAnalyticsEvent(
  input: unknown,
): SanitisedAnalyticsEvent | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const object = input as Record<string, unknown>;
  const keys = Object.keys(object);
  if (keys.some((key) => key !== "event" && key !== "value")) return null;
  if (typeof object.event !== "string" || !(object.event in EVENT_POLICY)) {
    return null;
  }

  const event = object.event as AnalyticsEventName;
  const policy = EVENT_POLICY[event];
  if (policy === null) {
    if (keys.includes("value")) return null;
    return { event, dimensionName: "none", dimensionValue: "all" };
  }

  if (typeof object.value !== "string") return null;
  const values = policy.values as readonly string[];
  if (!values.includes(object.value)) return null;
  return {
    event,
    dimensionName: policy.dimension,
    dimensionValue: object.value,
  };
}

export function analyticsEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function analyticsRetentionCutoffDay(now = Date.now()): string {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("The analytics retention time is invalid.");
  }
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - (ANALYTICS_RETENTION_DAYS - 1));
  return date.toISOString().slice(0, 10);
}

export function analyticsCollectionForPath(pathname: string): string | null {
  if (pathname === "/reports") return "all";
  if (pathname === "/reports/strategic") return "strategic";
  if (pathname === "/reports/legal") return "legal";
  if (pathname === "/markets") return "markets";
  return null;
}

/**
 * Claim one embedded-PDF load per viewer instance and PDF URL. The URL is used
 * only as an in-memory de-duplication key and is never included in the event.
 */
export function claimEmbeddedPdfView(
  claimedLoads: Set<string>,
  publicationType: (typeof PUBLICATION_TYPES)[number],
  pdfUrl: string,
): AnalyticsClientEvent | null {
  if (
    !(PUBLICATION_TYPES as readonly string[]).includes(publicationType) ||
    !pdfUrl
  ) {
    return null;
  }
  const key = `${publicationType}:${pdfUrl}`;
  if (claimedLoads.has(key)) return null;
  claimedLoads.add(key);
  return { event: "report_pdf_view", value: publicationType };
}

/** Convert a public pathname into bounded events without retaining the path. */
export function analyticsEventsForPath(pathname: string): AnalyticsClientEvent[] {
  if (
    !pathname.startsWith("/") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/preview") ||
    pathname.startsWith("/social") ||
    pathname.startsWith("/_")
  ) {
    return [];
  }

  let page: (typeof PAGE_VALUES)[number] = "other_public";
  let publicationType: (typeof PUBLICATION_TYPES)[number] | null = null;

  if (pathname === "/") page = "home";
  else if (pathname === "/reports") page = "reports_listing";
  else if (pathname === "/reports/strategic") page = "strategic_listing";
  else if (pathname === "/reports/legal") page = "legal_listing";
  else if (pathname === "/markets") page = "markets_listing";
  else if (/^\/reports\/strategic\/[^/]+\/?$/.test(pathname)) {
    page = "report_detail";
    publicationType = "strategic";
  } else if (/^\/reports\/legal\/[^/]+\/?$/.test(pathname)) {
    page = "report_detail";
    publicationType = "legal";
  } else if (/^\/markets\/[^/]+\/?$/.test(pathname)) {
    page = "report_detail";
    publicationType = "markets";
  } else if (pathname === "/apply") page = "application";
  else if (pathname === "/apply/confirmation") page = "application_confirmation";
  else if (pathname === "/team") page = "team";
  else if (pathname === "/info") page = "information";
  else if (pathname === "/privacy") page = "privacy";
  else if (pathname === "/terms") page = "terms";
  else if (pathname === "/accessibility") page = "accessibility";

  return [
    { event: "page_view", value: page },
    ...(publicationType
      ? [{ event: "report_web_view", value: publicationType } as const]
      : []),
    ...(pathname === "/apply"
      ? [{ event: "application_page_view" } as const]
      : []),
  ];
}
