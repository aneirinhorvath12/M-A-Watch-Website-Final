import assert from "node:assert/strict";
import test from "node:test";
import {
  analyticsEnabled,
  analyticsEventsForPath,
  analyticsRetentionCutoffDay,
  claimEmbeddedPdfView,
  sanitiseAnalyticsEvent,
} from "../lib/analytics-policy";

test("analytics accepts only the approved low-cardinality event vocabulary", () => {
  assert.deepEqual(sanitiseAnalyticsEvent({ event: "page_view", value: "home" }), {
    event: "page_view",
    dimensionName: "page",
    dimensionValue: "home",
  });
  assert.deepEqual(sanitiseAnalyticsEvent({ event: "application_submit_success" }), {
    event: "application_submit_success",
    dimensionName: "none",
    dimensionValue: "all",
  });
  assert.deepEqual(
    sanitiseAnalyticsEvent({ event: "publication_filter", value: "apply:legal" }),
    {
      event: "publication_filter",
      dimensionName: "interaction",
      dimensionValue: "apply:legal",
    },
  );

  assert.equal(sanitiseAnalyticsEvent({ event: "page_view", value: "/private/path" }), null);
  assert.equal(sanitiseAnalyticsEvent({ event: "publication_search", value: "takeover query" }), null);
  assert.equal(sanitiseAnalyticsEvent({ event: "application_submit_success", value: "application_1" }), null);
  assert.equal(sanitiseAnalyticsEvent({ event: "unknown", value: "home" }), null);
});

test("analytics rejects extra fields rather than retaining or silently stripping personal data", () => {
  assert.equal(
    sanitiseAnalyticsEvent({
      event: "application_validation_failure",
      value: "client_validation",
      email: "student@example.test",
    }),
    null,
  );
  assert.equal(
    sanitiseAnalyticsEvent({
      event: "publication_search",
      value: "all",
      query: "named company or person",
    }),
    null,
  );
  assert.equal(sanitiseAnalyticsEvent(null), null);
  assert.equal(sanitiseAnalyticsEvent([]), null);
});

test("public paths map to aggregate categories without exposing slugs or query text", () => {
  assert.deepEqual(analyticsEventsForPath("/reports/strategic/private-deal-slug"), [
    { event: "page_view", value: "report_detail" },
    { event: "report_web_view", value: "strategic" },
  ]);
  assert.deepEqual(analyticsEventsForPath("/apply"), [
    { event: "page_view", value: "application" },
    { event: "application_page_view" },
  ]);
  assert.deepEqual(analyticsEventsForPath("/admin/applicants/application_123"), []);
  assert.doesNotMatch(
    JSON.stringify(analyticsEventsForPath("/reports/legal/sensitive-target-name")),
    /sensitive-target-name/,
  );
});

test("analytics and retention are explicit and bounded", () => {
  assert.equal(analyticsEnabled("true"), true);
  assert.equal(analyticsEnabled(" TRUE "), true);
  assert.equal(analyticsEnabled("1"), false);
  assert.equal(analyticsEnabled(undefined), false);
  assert.equal(
    analyticsRetentionCutoffDay(Date.parse("2026-08-04T12:00:00Z")),
    "2025-07-01",
  );
});

test("an embedded PDF view is claimed once per viewer instance without sending its URL", () => {
  const oneMount = new Set<string>();
  assert.deepEqual(
    claimEmbeddedPdfView(oneMount, "strategic", "/api/publications/deal/pdf"),
    { event: "report_pdf_view", value: "strategic" },
  );
  assert.equal(
    claimEmbeddedPdfView(oneMount, "strategic", "/api/publications/deal/pdf"),
    null,
  );
  assert.deepEqual(
    claimEmbeddedPdfView(oneMount, "legal", "/api/publications/legal/pdf"),
    { event: "report_pdf_view", value: "legal" },
  );

  const remount = new Set<string>();
  const remountedEvent = claimEmbeddedPdfView(
    remount,
    "strategic",
    "/api/publications/deal/pdf",
  );
  assert.deepEqual(remountedEvent, {
    event: "report_pdf_view",
    value: "strategic",
  });
  assert.doesNotMatch(JSON.stringify(remountedEvent), /publications\/deal/);
});
