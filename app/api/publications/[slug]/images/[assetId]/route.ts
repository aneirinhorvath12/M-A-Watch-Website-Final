import { ensureDatabase } from "@/db/bootstrap";
import { getAdminActor } from "@/lib/admin-auth";
import {
  articleReferencesManagedImage,
  isSafeManagedAssetId,
  publicationImageKey,
  safeManagedImageContentType,
} from "@/lib/managed-images";
import { database, privateFiles } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; assetId: string }> }) {
  await ensureDatabase();
  const { slug, assetId } = await params;
  if (!isSafeManagedAssetId(assetId)) return new Response("Not found", { status: 404 });
  const publication = await database()
    .prepare("SELECT id, slug, status, web_body FROM publications WHERE slug = ? OR id = ? LIMIT 1")
    .bind(slug, slug)
    .first<{ id: string; slug: string; status: string; web_body: string }>();
  if (!publication) return new Response("Not found", { status: 404 });

  const isPublic = publication.status === "published";
  if (isPublic && !articleReferencesManagedImage(publication.web_body, publication.id, publication.slug, assetId)) {
    return new Response("Not found", { status: 404 });
  }
  if (!isPublic && !(await getAdminActor())) return new Response("Not found", { status: 404 });
  const key = publicationImageKey(publication.id, assetId);
  if (!key) return new Response("Not found", { status: 404 });
  const object = await privateFiles().get(key);
  const contentType = object?.httpMetadata?.contentType;
  if (!object || !safeManagedImageContentType(contentType)) return new Response("Not found", { status: 404 });

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
