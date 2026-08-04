import { ensureDatabase } from "@/db/bootstrap";
import { database } from "@/lib/platform";

export {
  cleanPlainText,
  hasSafeRequestOrigin,
  inspectPdf,
  MAX_CV_BYTES,
  MAX_CV_MULTIPART_BYTES,
  MAX_PUBLICATION_BYTES,
  MAX_PUBLICATION_MULTIPART_BYTES,
  normalisePublicationPdfFilename,
  readBoundedMultipartForm,
} from "@/lib/security-helpers";
export type {
  BoundedMultipartFormResult,
  FileInspection,
} from "@/lib/security-helpers";

export async function rateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs < 1) {
    throw new Error("The rate-limit policy is invalid.");
  }
  await ensureDatabase();
  // Cloudflare supplies this header at the trusted edge. Falling back to one
  // shared anonymous bucket is intentionally fail-safe; a caller-controlled
  // X-Forwarded-For value must not create unlimited identities.
  const forwarded = request.headers.get("cf-connecting-ip") ?? "unknown";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${bucket}:${forwarded}`),
  );
  const key = Array.from(new Uint8Array(digest).slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const now = Date.now();
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
    .bind(key, now, now + windowMs, now, now, now)
    .first<{ attempts: number }>();
  if (!result) throw new Error("The rate limit could not be recorded.");
  return result.attempts <= limit;
}
