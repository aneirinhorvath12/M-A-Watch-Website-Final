import { ensureDatabase } from "@/db/bootstrap";
import { getAdminActor } from "@/lib/admin-auth";
import {
  parsePublicationCoverReference,
  publicationCoverKey,
  safeManagedImageContentType,
} from "@/lib/managed-images";
import { database, privateFiles } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; assetId: string }> },
) {
  await ensureDatabase();
  const { slug, assetId } = await params;
  const publication = await database()
    .prepare("SELECT id, status, cover_image_key FROM publications WHERE slug = ? OR id = ? LIMIT 1")
    .bind(slug, slug)
    .first<{ id: string; status: string; cover_image_key: string | null }>();
  const reference = parsePublicationCoverReference(publication?.cover_image_key);
  if (!publication || !reference || reference.assetId !== assetId) return notFound();
  const isPublic = publication.status === "published";
  if (!isPublic && !(await getAdminActor())) return notFound();
  const key = publicationCoverKey(publication.id, assetId);
  if (!key) return notFound();
  const object = await privateFiles().get(key);
  const contentType = object?.httpMetadata?.contentType;
  if (
    !object ||
    !safeManagedImageContentType(contentType) ||
    contentType !== reference.contentType
  ) return notFound();
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
