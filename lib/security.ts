import { ensureDatabase } from "@/db/bootstrap";
import { database } from "@/lib/platform";

export {
  cleanPlainText,
  hasSafeRequestOrigin,
  inspectPdf,
  MAX_CV_BYTES,
  MAX_PUBLICATION_BYTES,
} from "@/lib/security-helpers";
export type { FileInspection } from "@/lib/security-helpers";

export async function rateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  await ensureDatabase();
  const forwarded =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${bucket}:${forwarded}`),
  );
  const key = Array.from(new Uint8Array(digest).slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const now = Date.now();
  const current = await database()
    .prepare("SELECT window_started_at, attempts, expires_at FROM rate_limits WHERE key = ?")
    .bind(key)
    .first<{ window_started_at: number; attempts: number; expires_at: number }>();

  if (!current || current.expires_at <= now) {
    await database()
      .prepare(
        `INSERT INTO rate_limits (key, window_started_at, attempts, expires_at)
         VALUES (?, ?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET window_started_at = excluded.window_started_at,
           attempts = 1, expires_at = excluded.expires_at`,
      )
      .bind(key, now, now + windowMs)
      .run();
    return true;
  }

  if (current.attempts >= limit) return false;
  await database()
    .prepare("UPDATE rate_limits SET attempts = attempts + 1 WHERE key = ?")
    .bind(key)
    .run();
  return true;
}
