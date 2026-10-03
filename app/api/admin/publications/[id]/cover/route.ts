import { matchesPublicationVersion, PUBLICATION_CONFLICT } from "@/lib/publication-edit-version";
import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest, readJsonObject } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import {
  createPublicationCoverReference,
  inspectManagedImage,
  meaningfulImageAlt,
  parsePublicationCoverReference,
  publicationCoverKey,
  publicationCoverPath,
  readBoundedImageForm,
} from "@/lib/managed-images";
import { database, privateFiles } from "@/lib/platform";

export const dynamic = "force-dynamic";

type PublicationCoverRow = {
  id: string;
  status: string;
  cover_image_key: string | null;
  edit_version: number;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const { id } = await params;
  const publication = await getPublication(id);
  if (!publication) return apiError("Publication not found.", 404);
  if (publication.status === "archived") {
    return apiError("Restore the publication before changing its cover.", 409);
  }
  const upload = await readBoundedImageForm(request);
  if (!upload.ok) return apiError(upload.error, upload.status);
  if (!matchesPublicationVersion(upload.form.get("expectedVersion"), publication.edit_version)) return apiError(PUBLICATION_CONFLICT, 409);
  const file = upload.form.get("cover");
  if (!(file instanceof File) || file.size < 1) {
    return apiError("Choose a JPEG, PNG or WebP cover image.", 422);
  }
  const alt = meaningfulImageAlt(upload.form.get("alt"));
  if (!alt) return apiError("Add meaningful alternative text for the cover.", 422);
  let image;
  try {
    image = await inspectManagedImage(file);
  } catch (cause) {
    return apiError(cause instanceof Error ? cause.message : "The cover image is invalid.", 422);
  }

  const assetId = `${crypto.randomUUID()}.${image.extension}`;
  const key = publicationCoverKey(publication.id, assetId);
  const src = publicationCoverPath(publication.id, assetId);
  if (!key || !src) return apiError("The cover identifier could not be created.", 500);
  const reference = createPublicationCoverReference(assetId, alt, image);
  await privateFiles().put(key, image.bytes, {
    httpMetadata: { contentType: image.contentType },
    customMetadata: {
      publicationId: publication.id,
      purpose: "cover",
      originalFilename: safeFilename(file.name),
      width: String(image.width),
      height: String(image.height),
      uploadedAt: String(Date.now()),
    },
  });
  const now = Date.now();
  const storedReference = JSON.stringify(reference);
  try {
    const updated = await database()
      .prepare(
        `UPDATE publications SET cover_image_key = ?, updated_by = ?, updated_at = ?
         WHERE id = ? AND cover_image_key IS ? AND edit_version = ?`,
      )
      .bind(storedReference, auth.actor.id, now, publication.id, publication.cover_image_key, publication.edit_version)
      .run();
    if ((updated.meta.changes ?? 0) < 1) {
      await privateFiles().delete(key);
      return apiError("The cover changed in another session. Refresh and try again.", 409);
    }
    try {
      await writeAudit({
        actorId: auth.actor.id,
        action: "publication.cover_replaced",
        entityType: "publication",
        entityId: publication.id,
        metadata: { assetId, contentType: image.contentType, size: image.bytes.byteLength, width: image.width, height: image.height },
      });
    } catch (cause) {
      await database()
        .prepare("UPDATE publications SET cover_image_key = ?, updated_by = ?, updated_at = ? WHERE id = ? AND cover_image_key = ?")
        .bind(publication.cover_image_key, auth.actor.id, now, publication.id, storedReference)
        .run();
      throw cause;
    }
  } catch (cause) {
    await privateFiles().delete(key);
    throw cause;
  }
  await deleteReplacedCover(publication, assetId);
  return Response.json({
    ok: true,
    version: publication.edit_version + 1,
    cover: { src, alt, width: image.width, height: image.height },
    message: "Publication cover saved.",
  }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const { id } = await params;
  const publication = await getPublication(id);
  if (!publication) return apiError("Publication not found.", 404);
  const payload = await readJsonObject(request);
  if (!matchesPublicationVersion(payload?.expectedVersion, publication.edit_version)) return apiError(PUBLICATION_CONFLICT, 409);
  const current = parsePublicationCoverReference(publication.cover_image_key);
  if (!current) return Response.json({ ok: true, version: publication.edit_version, message: "No managed cover was set." });
  const now = Date.now();
  const removed = await database()
    .prepare(
      `UPDATE publications SET cover_image_key = NULL, updated_by = ?, updated_at = ?
       WHERE id = ? AND cover_image_key = ? AND edit_version = ?`,
    )
    .bind(auth.actor.id, now, publication.id, publication.cover_image_key, publication.edit_version)
    .run();
  if ((removed.meta.changes ?? 0) < 1) {
    return apiError("The cover changed in another session. Refresh and try again.", 409);
  }
  try {
    await writeAudit({
      actorId: auth.actor.id,
      action: "publication.cover_removed",
      entityType: "publication",
      entityId: publication.id,
      metadata: { assetId: current.assetId },
    });
  } catch (cause) {
    await database()
      .prepare("UPDATE publications SET cover_image_key = ?, updated_by = ?, updated_at = ? WHERE id = ? AND cover_image_key IS NULL")
      .bind(publication.cover_image_key, auth.actor.id, now, publication.id)
      .run();
    throw cause;
  }
  const key = publicationCoverKey(publication.id, current.assetId);
  if (key) {
    try { await privateFiles().delete(key); } catch { console.error("Unable to remove a superseded publication cover."); }
  }
  return Response.json({ ok: true, version: publication.edit_version + 1, message: "Publication cover removed." });
}

async function getPublication(id: string): Promise<PublicationCoverRow | null> {
  return database()
    .prepare("SELECT id, status, cover_image_key, edit_version FROM publications WHERE id = ? LIMIT 1")
    .bind(id)
    .first<PublicationCoverRow>();
}

async function deleteReplacedCover(publication: PublicationCoverRow, nextAssetId: string): Promise<void> {
  const previous = parsePublicationCoverReference(publication.cover_image_key);
  if (!previous || previous.assetId === nextAssetId) return;
  const key = publicationCoverKey(publication.id, previous.assetId);
  if (!key) return;
  try { await privateFiles().delete(key); } catch { console.error("Unable to remove a superseded publication cover."); }
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "publication-cover";
}
