import { ensureDatabase } from "@/db/bootstrap";
import {
  apiError,
  authorizeAdminRequest,
  readJsonObject,
  stringValue,
} from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import { infoAssetKey, infoImageAssetIds } from "@/lib/managed-images";
import { database, privateFiles, safeJson } from "@/lib/platform";
import {
  isManagedContentKey,
  validateManagedContent,
} from "@/lib/site-content";

const MAX_REQUEST_BYTES = 64_000;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  const { key } = await params;
  if (!isManagedContentKey(key)) {
    return apiError("This content section is not editable.", 404);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return apiError("The content update is too large.", 413);
  }
  const payload = await readJsonObject(request);
  if (!payload) return apiError("The content update could not be read.", 400);
  const intent = stringValue(payload.intent, 20) || "save";
  if (intent !== "save" && intent !== "publish") {
    return apiError("Unsupported content action.", 400);
  }

  await ensureDatabase();
  const current = await database()
    .prepare("SELECT draft_value, published_value FROM content_entries WHERE key = ?")
    .bind(key)
    .first<{ draft_value: string; published_value: string }>();
  const now = Date.now();
  let discardedInfoAssets = new Set<string>();

  if (intent === "save") {
    const validation = validateManagedContent(key, payload.value);
    if (!validation.ok) return apiError(validation.error, 422);
    const json = JSON.stringify(validation.value);
    if (key === "info.page") {
      const previousDraft = infoImageAssetIds(safeJson<unknown>(current?.draft_value, null));
      const nextDraft = infoImageAssetIds(validation.value);
      const published = infoImageAssetIds(safeJson<unknown>(current?.published_value, null));
      discardedInfoAssets = new Set(
        [...previousDraft].filter((assetId) => !nextDraft.has(assetId) && !published.has(assetId)),
      );
    }
    await database()
      .prepare(
        `INSERT INTO content_entries
         (key, draft_value, published_value, updated_by, updated_at, published_at)
         VALUES (?, ?, ?, ?, ?, NULL)
         ON CONFLICT(key) DO UPDATE SET
           draft_value = excluded.draft_value,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
      )
      .bind(key, json, current?.published_value ?? "{}", auth.actor.id, now)
      .run();
  } else {
    if (!current) return apiError("Save a draft before publishing this section.", 409);
    const validation = validateManagedContent(
      key,
      safeJson<unknown>(current.draft_value, null),
    );
    if (!validation.ok) {
      return apiError(`The saved draft cannot be published: ${validation.error}`, 422);
    }
    if (key === "info.page") {
      const previousPublished = infoImageAssetIds(safeJson<unknown>(current.published_value, null));
      const nextPublished = infoImageAssetIds(validation.value);
      discardedInfoAssets = new Set(
        [...previousPublished].filter((assetId) => !nextPublished.has(assetId)),
      );
    }
    const result = await database()
      .prepare(
        `UPDATE content_entries
         SET published_value = ?, updated_by = ?, updated_at = ?, published_at = ?
         WHERE key = ?`,
      )
      .bind(JSON.stringify(validation.value), auth.actor.id, now, now, key)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      return apiError("The saved draft could not be published.", 409);
    }
  }

  await writeAudit({
    actorId: auth.actor.id,
    action: intent === "publish" ? "content.published" : "content.draft_saved",
    entityType: "content_entry",
    entityId: key,
    metadata: { schema: "managed-content-v1" },
  });
  if (key === "info.page" && discardedInfoAssets.size) {
    const latest = await database()
      .prepare("SELECT draft_value, published_value FROM content_entries WHERE key = 'info.page' LIMIT 1")
      .first<{ draft_value: string; published_value: string }>();
    const retained = new Set([
      ...infoImageAssetIds(safeJson<unknown>(latest?.draft_value, null)),
      ...infoImageAssetIds(safeJson<unknown>(latest?.published_value, null)),
    ]);
    await Promise.all([...discardedInfoAssets].map(async (assetId) => {
      if (retained.has(assetId)) return;
      const assetKey = infoAssetKey(assetId);
      if (!assetKey) return;
      try {
        await privateFiles().delete(assetKey);
      } catch {
        // The asset is private and no longer referenced. A transient cleanup
        // failure must not roll back an otherwise valid content publication.
        console.error("Unable to clean up an unreferenced Info image.");
      }
    }));
  }
  return Response.json({
    ok: true,
    message: intent === "publish"
      ? "Saved draft published."
      : "Draft saved; public content is unchanged.",
  });
}
