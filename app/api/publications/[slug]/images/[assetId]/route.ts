import { ensureDatabase } from "@/db/bootstrap";
import { getAdminActor } from "@/lib/admin-auth";
import { database, privateFiles } from "@/lib/platform";

export const dynamic = "force-dynamic";

const SAFE_ASSET_ID = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;
const SAFE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; assetId: string }> }) {
  await ensureDatabase();
  const { slug, assetId } = await params;
  if (!SAFE_ASSET_ID.test(assetId)) return new Response("Not found", { status: 404 });
  const publication = await database()
    .prepare("SELECT id, status FROM publications WHERE slug = ? OR id = ? LIMIT 1")
    .bind(slug, slug)
    .first<{ id: string; status: string }>();
  if (!publication) return new Response("Not found", { status: 404 });

  const isPublic = publication.status === "published";
  if (!isPublic && !(await getAdminActor())) return new Response("Not found", { status: 404 });
  const object = await privateFiles().get(`private/publication-assets/${publication.id}/${assetId}`);
  const contentType = object?.httpMetadata?.contentType ?? "";
  if (!object || !SAFE_TYPES.has(contentType)) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Cache-Control": isPublic ? "public, max-age=300, s-maxage=300" : "private, no-store, max-age=0",
      "Content-Length": String(object.size),
      "Content-Type": contentType,
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
