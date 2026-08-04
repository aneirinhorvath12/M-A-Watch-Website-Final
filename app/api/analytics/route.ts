import { env } from "cloudflare:workers";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { readBoundedUtf8Body } from "@/lib/analytics-request";
import {
  analyticsEnabled,
  sanitiseAnalyticsEvent,
} from "@/lib/analytics-policy";
import { hasSafeRequestOrigin } from "@/lib/security-helpers";

export const dynamic = "force-dynamic";

const MAX_ANALYTICS_REQUEST_BYTES = 512;
const RESPONSE_HEADERS = {
  "cache-control": "no-store, max-age=0",
};

type AnalyticsRuntime = { ANALYTICS_ENABLED?: string };

export async function POST(request: Request) {
  const runtime = env as unknown as AnalyticsRuntime;
  if (!analyticsEnabled(runtime.ANALYTICS_ENABLED)) {
    return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
  }
  if (!hasSafeRequestOrigin(request)) {
    return Response.json(
      { error: "Invalid request origin." },
      { status: 403, headers: RESPONSE_HEADERS },
    );
  }
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    try {
      await request.body?.cancel("Declared analytics request exceeded the byte limit.");
    } catch {
      // A locked or already-closed stream needs no further action.
    }
    return Response.json(
      { error: "Analytics events must use JSON." },
      { status: 415, headers: RESPONSE_HEADERS },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > MAX_ANALYTICS_REQUEST_BYTES
  ) {
    try {
      await request.body?.cancel("Declared analytics request exceeded the byte limit.");
    } catch {
      // A locked or already-closed stream needs no further action.
    }
    return Response.json(
      { error: "Analytics event is too large." },
      { status: 413, headers: RESPONSE_HEADERS },
    );
  }

  const body = await readBoundedUtf8Body(
    request.body,
    MAX_ANALYTICS_REQUEST_BYTES,
  );
  if (!body.ok && body.tooLarge) {
    return Response.json(
      { error: "Analytics event is too large." },
      { status: 413, headers: RESPONSE_HEADERS },
    );
  }
  if (!body.ok) {
    return Response.json(
      { error: "Analytics event could not be read." },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return Response.json(
      { error: "Analytics event is invalid." },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }
  const event = sanitiseAnalyticsEvent(parsed);
  if (!event) {
    return Response.json(
      { error: "Analytics event is invalid." },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  try {
    const outcome = await recordAnalyticsEvent(event);
    if (outcome === "rate_limited") {
      return Response.json(
        { error: "Analytics is temporarily busy." },
        {
          status: 429,
          headers: { ...RESPONSE_HEADERS, "retry-after": "60" },
        },
      );
    }
  } catch {
    return Response.json(
      { error: "Analytics is temporarily unavailable." },
      { status: 503, headers: RESPONSE_HEADERS },
    );
  }

  return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
}
