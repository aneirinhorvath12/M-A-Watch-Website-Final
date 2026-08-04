import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import {
  infoAssetKey,
  infoAssetPath,
  inspectManagedImage,
  meaningfulImageAlt,
  readBoundedImageForm,
} from "@/lib/managed-images";
import { privateFiles } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const upload = await readBoundedImageForm(request);
  if (!upload.ok) return apiError(upload.error, upload.status);
  const file = upload.form.get("image");
  if (!(file instanceof File) || file.size < 1) {
    return apiError("Choose a JPEG, PNG or WebP image.", 422);
  }
  const alt = meaningfulImageAlt(upload.form.get("alt"));
  if (!alt) return apiError("Add meaningful alternative text before uploading the image.", 422);

  let image;
  try {
    image = await inspectManagedImage(file);
  } catch (cause) {
    return apiError(cause instanceof Error ? cause.message : "The image is invalid.", 422);
  }
  const assetId = `${crypto.randomUUID()}.${image.extension}`;
  const key = infoAssetKey(assetId);
  const src = infoAssetPath(assetId);
  if (!key || !src) return apiError("The image identifier could not be created.", 500);
  await privateFiles().put(key, image.bytes, {
    httpMetadata: { contentType: image.contentType },
    customMetadata: {
      area: "info.page",
      originalFilename: safeFilename(file.name),
      width: String(image.width),
      height: String(image.height),
      uploadedAt: String(Date.now()),
    },
  });
  try {
    await writeAudit({
      actorId: auth.actor.id,
      action: "content.info_image_uploaded",
      entityType: "content_entry",
      entityId: "info.page",
      metadata: {
        assetId,
        contentType: image.contentType,
        size: image.bytes.byteLength,
        width: image.width,
        height: image.height,
      },
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
    message: "Image uploaded. Save the Info draft to retain it in the page.",
  }, { status: 201 });
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "info-image";
}
