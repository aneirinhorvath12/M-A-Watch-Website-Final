import { ensureDatabase } from "@/db/bootstrap";
import { getAdminActor } from "@/lib/admin-auth";
import { infoAssetKey, infoImageAssetIds, safeManagedImageContentType } from "@/lib/managed-images";
import { database, privateFiles, safeJson } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  await ensureDatabase();
  const { assetId } = await params;
  const key = infoAssetKey(assetId);
  if (!key) return notFound();
  const row = await database()
    .prepare("SELECT draft_value, published_value, published_at FROM content_entries WHERE key = 'info.page' LIMIT 1")
    .first<{ draft_value: string; published_value: string; published_at: number | null }>();
  const isPublic = Boolean(
    row?.published_at && infoImageAssetIds(safeJson<unknown>(row.published_value, null)).has(assetId),
  );
  if (!isPublic) {
    const actor = await getAdminActor();
    const inDraft = row && infoImageAssetIds(safeJson<unknown>(row.draft_value, null)).has(assetId);
    if (!actor || !inDraft) return notFound();
  }
  const object = await privateFiles().get(key);
  const contentType = object?.httpMetadata?.contentType;
  if (!object || !safeManagedImageContentType(contentType)) return notFound();
  return new Response(object.body, {
    headers: {
      "Cache-Control": isPublic
        ? "public, max-age=300, s-maxage=300, must-revalidate"
        : "private, no-store, max-age=0",
      "Content-Length": String(object.size),
      "Content-Type": contentType,
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}
