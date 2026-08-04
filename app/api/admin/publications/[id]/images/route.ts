import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import { database, privateFiles } from "@/lib/platform";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = {
  "image/jpeg": { extension: "jpg", signatures: [[0xff, 0xd8, 0xff]] },
  "image/png": { extension: "png", signatures: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
  "image/webp": { extension: "webp", signatures: [[0x52, 0x49, 0x46, 0x46]] },
} as const;

function hasSignature(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function dimension(value: FormDataEntryValue | null): number | null {
  const result = Number(value);
  return Number.isInteger(result) && result > 0 && result <= 12_000 ? result : null;
}

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

  let form: FormData;
  try { form = await request.formData(); } catch { return apiError("The image upload could not be read.", 400); }
  const image = form.get("image");
  if (!(image instanceof File)) return apiError("Choose a JPEG, PNG or WebP image.", 422);
  if (image.size < 1 || image.size > MAX_IMAGE_BYTES) return apiError("Images must be no larger than 5 MB.", 422);
  const definition = IMAGE_TYPES[image.type as keyof typeof IMAGE_TYPES];
  if (!definition) return apiError("Choose a JPEG, PNG or WebP image.", 422);
  const width = dimension(form.get("width"));
  const height = dimension(form.get("height"));
  if (!width || !height) return apiError("The image dimensions could not be verified.", 422);

  const bytes = new Uint8Array(await image.arrayBuffer());
  if (!definition.signatures.some((signature) => hasSignature(bytes, signature))) {
    return apiError("The uploaded bytes do not match the selected image type.", 422);
  }
  if (image.type === "image/webp" && new TextDecoder("ascii").decode(bytes.slice(8, 12)) !== "WEBP") {
    return apiError("The uploaded bytes do not contain a valid WebP header.", 422);
  }

  const assetId = `${crypto.randomUUID()}.${definition.extension}`;
  const key = `private/publication-assets/${publication.id}/${assetId}`;
  await privateFiles().put(key, bytes, {
    httpMetadata: { contentType: image.type },
    customMetadata: {
      publicationId: publication.id,
      originalFilename: image.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120),
      width: String(width),
      height: String(height),
    },
  });
  try {
    await writeAudit({
      actorId: auth.actor.id,
      action: "publication.image_uploaded",
      entityType: "publication",
      entityId: publication.id,
      metadata: { assetId, contentType: image.type, size: image.size, width, height },
    });
  } catch (cause) {
    await privateFiles().delete(key);
    throw cause;
  }
  return Response.json({
    ok: true,
    src: `/api/publications/${encodeURIComponent(publication.id)}/images/${assetId}`,
    width,
    height,
    message: "Image uploaded. Add meaningful alternative text before review.",
  }, { status: 201 });
}
