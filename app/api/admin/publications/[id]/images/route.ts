import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import {
  inspectManagedImage,
  managedPublicationImagePath,
  publicationImageKey,
  readBoundedImageForm,
} from "@/lib/managed-images";
import { database, privateFiles } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const { id } = await params;
  const publication = await database()
    .prepare("SELECT id, status FROM publications WHERE id = ? LIMIT 1")
    .bind(id)
    .first<{ id: string; status: string }>();
  if (!publication) return apiError("Publication not found.", 404);
  if (publication.status === "archived") return apiError("Restore the publication before adding an image.", 409);

  const upload = await readBoundedImageForm(request);
  if (!upload.ok) return apiError(upload.error, upload.status);
  const file = upload.form.get("image");
  if (!(file instanceof File) || file.size < 1) return apiError("Choose a JPEG, PNG or WebP image.", 422);
  let image;
  try { image = await inspectManagedImage(file); } catch (cause) {
    return apiError(cause instanceof Error ? cause.message : "The image is invalid.", 422);
  }

  const assetId = `${crypto.randomUUID()}.${image.extension}`;
  const key = publicationImageKey(publication.id, assetId);
  const src = managedPublicationImagePath(publication.id, assetId);
  if (!key || !src) return apiError("The image identifier could not be created.", 500);
  await privateFiles().put(key, image.bytes, {
    httpMetadata: { contentType: image.contentType },
    customMetadata: {
      publicationId: publication.id,
      originalFilename: file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120),
      width: String(image.width),
      height: String(image.height),
      uploadedAt: String(Date.now()),
    },
  });
  try {
    await writeAudit({
      actorId: auth.actor.id,
      action: "publication.image_uploaded",
      entityType: "publication",
      entityId: publication.id,
      metadata: { assetId, contentType: image.contentType, size: image.bytes.byteLength, width: image.width, height: image.height },
    });
  } catch (cause) {
    await privateFiles().delete(key);
    throw cause;
  }
  return Response.json({
    ok: true,
    src,
    width: image.width,
    height: image.height,
    message: "Image uploaded. Add meaningful alternative text before review.",
  }, { status: 201 });
}
