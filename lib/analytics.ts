import { ensureDatabase } from "@/db/bootstrap";
import {
  analyticsRetentionCutoffDay,
  type SanitisedAnalyticsEvent,
} from "@/lib/analytics-policy";
import { database } from "@/lib/platform";

const ANALYTICS_RATE_LIMIT_KEY = "analytics:public:global";
const ANALYTICS_RATE_LIMIT = 3_000;
const ANALYTICS_RATE_WINDOW_MS = 60_000;

export type AnalyticsRecordResult = "recorded" | "rate_limited";

/**
 * Record one aggregate counter. This code deliberately never accepts a
 * Request, so IP, user-agent, referrer, cookies and request URLs cannot reach
 * the storage statement.
 */
export async function recordAnalyticsEvent(
  event: SanitisedAnalyticsEvent,
  now = Date.now(),
): Promise<AnalyticsRecordResult> {
  await ensureDatabase();
  if (!(await withinGlobalAnalyticsRateLimit(now))) return "rate_limited";

  const day = new Date(now).toISOString().slice(0, 10);
  await database()
    .prepare(
      `INSERT INTO analytics_daily
       (day, event, dimension_name, dimension_value, count, updated_at)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(day, event, dimension_name, dimension_value) DO UPDATE SET
         count = CASE
           WHEN analytics_daily.count < 2147483647 THEN analytics_daily.count + 1
           ELSE analytics_daily.count
         END,
         updated_at = excluded.updated_at`,
    )
    .bind(
      day,
      event.event,
      event.dimensionName,
      event.dimensionValue,
      now,
    )
    .run();
  return "recorded";
}

export async function pruneExpiredAnalytics(now = Date.now()): Promise<number> {
  const result = await database()
    .prepare("DELETE FROM analytics_daily WHERE day < ?")
    .bind(analyticsRetentionCutoffDay(now))
    .run();
  return result.meta.changes ?? 0;
}

async function withinGlobalAnalyticsRateLimit(now: number): Promise<boolean> {
  const result = await database()
    .prepare(
      `INSERT INTO rate_limits (key, window_started_at, attempts, expires_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         window_started_at = CASE
           WHEN rate_limits.expires_at <= ? THEN excluded.window_started_at
           ELSE rate_limits.window_started_at
         END,
         attempts = CASE
           WHEN rate_limits.expires_at <= ? THEN 1
           ELSE rate_limits.attempts + 1
         END,
         expires_at = CASE
           WHEN rate_limits.expires_at <= ? THEN excluded.expires_at
           ELSE rate_limits.expires_at
         END
       RETURNING attempts`,
    )
    .bind(
      ANALYTICS_RATE_LIMIT_KEY,
      now,
      now + ANALYTICS_RATE_WINDOW_MS,
      now,
      now,
      now,
    )
    .first<{ attempts: number }>();
  if (!result) throw new Error("The analytics rate limit could not be recorded.");
  return result.attempts <= ANALYTICS_RATE_LIMIT;
}
