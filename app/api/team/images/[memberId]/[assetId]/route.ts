import { ensureDatabase } from "@/db/bootstrap";
import { getAdminActor } from "@/lib/admin-auth";
import { database, privateFiles } from "@/lib/platform";
import {
  managedTeamPhotoKey,
  managedTeamPhotoPath,
} from "@/lib/team-media";

export const dynamic = "force-dynamic";

const SAFE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ memberId: string; assetId: string }>;
  },
) {
  await ensureDatabase();
  const { memberId, assetId } = await params;
  const photoPath = managedTeamPhotoPath(memberId, assetId);
  if (!photoPath) return new Response("Not found", { status: 404 });
  const member = await database()
    .prepare(
      "SELECT active FROM team_members WHERE id = ? AND photo_key = ? LIMIT 1",
    )
    .bind(memberId, photoPath)
    .first<{ active: number }>();
  if (!member) return new Response("Not found", { status: 404 });

  const isPublic = Boolean(member.active);
  if (!isPublic && !(await getAdminActor())) {
    return new Response("Not found", { status: 404 });
  }
  const key = managedTeamPhotoKey(photoPath);
  if (!key) return new Response("Not found", { status: 404 });
  const object = await privateFiles().get(key);
  const contentType = object?.httpMetadata?.contentType ?? "";
  if (!object || !SAFE_TYPES.has(contentType)) {
    return new Response("Not found", { status: 404 });
  }

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
