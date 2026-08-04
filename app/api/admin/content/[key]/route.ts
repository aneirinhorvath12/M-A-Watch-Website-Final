import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest, readJsonObject, stringValue } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import { database, safeJson } from "@/lib/platform";

const ALLOWED_KEYS = new Set(["homepage.hero", "homepage.overview", "info.page", "site.contact"]);

function safeHref(value: unknown): string {
  const href = stringValue(value, 500);
  if (!href) return "";
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try { const url = new URL(href); return url.protocol === "https:" || url.protocol === "mailto:" ? href : ""; } catch { return ""; }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  const { key } = await params;
  if (!ALLOWED_KEYS.has(key)) return apiError("This content section is not editable.", 404);
  const payload = await readJsonObject(request);
  if (!payload) return apiError("The content update could not be read.", 400);
  const intent = stringValue(payload.intent, 20) || "save";
  if (intent !== "save" && intent !== "publish") return apiError("Unsupported content action.", 400);
  await ensureDatabase();
  const current = await database().prepare("SELECT draft_value, published_value FROM content_entries WHERE key = ?").bind(key).first<{ draft_value: string; published_value: string }>();
  const draft = safeJson<{ title?: string; body?: string; ctaLabel?: string; ctaHref?: string }>(current?.draft_value, {});
  const next = {
    title: payload.title === undefined ? draft.title ?? "" : stringValue(payload.title, 180),
    body: payload.body === undefined ? draft.body ?? "" : stringValue(payload.body, 8_000),
    ctaLabel: payload.ctaLabel === undefined ? draft.ctaLabel ?? "" : stringValue(payload.ctaLabel, 80),
    ctaHref: payload.ctaHref === undefined ? draft.ctaHref ?? "" : safeHref(payload.ctaHref),
  };
  if (!next.title) return apiError("Add a section title.", 422);
  if (stringValue(payload.ctaHref, 500) && !next.ctaHref) return apiError("The call-to-action link must be a site path, HTTPS URL or email link.", 422);
  const now = Date.now();
  const json = JSON.stringify(next);
  await database().prepare(
    `INSERT INTO content_entries (key, draft_value, published_value, updated_by, updated_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET draft_value = excluded.draft_value,
       published_value = CASE WHEN ? = 'publish' THEN excluded.draft_value ELSE content_entries.published_value END,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at,
       published_at = CASE WHEN ? = 'publish' THEN excluded.published_at ELSE content_entries.published_at END`,
  ).bind(key, json, intent === "publish" ? json : current?.published_value ?? "{}", auth.actor.id, now, intent === "publish" ? now : null, intent, intent).run();
  await writeAudit({
    actorId: auth.actor.id,
    action: intent === "publish" ? "content.published" : "content.draft_saved",
    entityType: "content_entry",
    entityId: key,
  });
  return Response.json({ ok: true, message: intent === "publish" ? "Content published." : "Draft saved; public content is unchanged." });
}
