"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  analyticsEventsForPath,
  sanitiseAnalyticsEvent,
  type AnalyticsClientEvent,
  type AnalyticsEventName,
} from "@/lib/analytics-policy";

export function trackAnalytics(event: AnalyticsClientEvent): void {
  // Reuse the edge policy in the browser so only the two-field aggregate
  // envelope can be queued. The API applies the same check independently.
  if (!sanitiseAnalyticsEvent(event)) return;
  const body = JSON.stringify(event);
  void fetch("/api/analytics", {
    method: "POST",
    body,
    cache: "no-store",
    credentials: "omit",
    headers: { "content-type": "application/json" },
    keepalive: true,
    referrerPolicy: "no-referrer",
  }).catch(() => {
    // Analytics must never interrupt navigation, downloads or form use.
  });
}

export function AnalyticsTracker() {
  const pathname = usePathname() ?? "/";
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    for (const event of analyticsEventsForPath(pathname)) trackAnalytics(event);
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const element = target.closest<HTMLElement>("[data-analytics-event]");
      if (!element) return;
      const analyticsEvent = element.dataset.analyticsEvent;
      if (!analyticsEvent) return;
      trackAnalytics({
        event: analyticsEvent as AnalyticsEventName,
        ...(element.dataset.analyticsValue
          ? { value: element.dataset.analyticsValue }
          : {}),
      });
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const collection = form.dataset.analyticsPublicationFilters;
      if (!collection) return;

      const data = new FormData(form);
      if (String(data.get("q") ?? "").trim()) {
        trackAnalytics({ event: "publication_search", value: collection });
      }
      if (["year", "by", "type"].some((name) => String(data.get(name) ?? "").trim())) {
        trackAnalytics({
          event: "publication_filter",
          value: `apply:${collection}`,
        });
      }
    };

    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("submit", onSubmit, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("submit", onSubmit, { capture: true });
    };
  }, []);

  return null;
}
