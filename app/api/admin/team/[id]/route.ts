import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest, stringValue } from "@/lib/admin-api";
import { createId, database, privateFiles } from "@/lib/platform";
import {
  inspectTeamPhoto,
  isValidLinkedInUrl,
  managedTeamPhotoKey,
  managedTeamPhotoPath,
  normaliseTeamPhotoPath,
  readTeamMemberRequest,
} from "@/lib/team-media";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  const input = await readTeamMemberRequest(request);
  if (!input.ok) return apiError(input.error, input.status);
  const { payload, photo } = input.value;
  const { id } = await params;
  await ensureDatabase();
  const current = await database().prepare("SELECT * FROM team_members WHERE id = ? LIMIT 1").bind(id).first<{
    name: string; role: string; group_name: string; photo_key: string | null; photo_alt: string | null;
    biography: string; linkedin_url: string | null; display_order: number; active: number;
    updated_at: number;
  }>();
  if (!current) return apiError("Team member not found.", 404);
  const expectedUpdatedAt =
    payload.updatedAt === undefined
      ? current.updated_at
      : Number(payload.updatedAt);
  if (
    !Number.isSafeInteger(expectedUpdatedAt) ||
    expectedUpdatedAt !== current.updated_at
  ) {
    return apiError(
      "This team member changed after you opened it. Reload before saving.",
      409,
    );
  }
  const name = payload.name === undefined ? current.name : stringValue(payload.name, 120);
  const role = payload.role === undefined ? current.role : stringValue(payload.role, 160);
  const group = payload.groupName === undefined ? current.group_name : stringValue(payload.groupName, 120);
  const biography = payload.biography === undefined ? current.biography : stringValue(payload.biography, 1_500);
  const linkedInUrl = payload.linkedInUrl === undefined ? current.linkedin_url ?? "" : stringValue(payload.linkedInUrl, 500);
  const removePhoto = ["on", "true", true].includes(payload.removePhoto as never);
  const requestedPhotoKey = removePhoto
    ? ""
    : payload.photoKey === undefined
      ? current.photo_key ?? ""
      : stringValue(payload.photoKey, 500);
  const photoAlt = payload.photoAlt === undefined ? current.photo_alt ?? "" : stringValue(payload.photoAlt, 220);
  const displayOrder = payload.displayOrder === undefined ? current.display_order : Math.max(0, Math.min(10_000, Number.parseInt(stringValue(payload.displayOrder, 8) || "0", 10) || 0));
  const active = payload.activePresent === undefined ? Boolean(current.active) : ["on", "true", true].includes(payload.active as never);
  if (name.length < 2 || !role || !group) return apiError("Name, role and team/group are required.", 422);
  if (!isValidLinkedInUrl(linkedInUrl)) return apiError("Enter a valid HTTPS LinkedIn URL.", 422);
  if (photo && removePhoto) return apiError("Choose either a replacement photograph or remove the current photograph.", 422);
  if (photo && !photoAlt) return apiError("Add alternative text before uploading the photograph.", 422);
  if (
    requestedPhotoKey.startsWith("/api/team/images/") &&
    requestedPhotoKey !== current.photo_key
  ) {
    return apiError("A managed photograph cannot be reused across team records.", 422);
  }
  if (requestedPhotoKey && !normaliseTeamPhotoPath(requestedPhotoKey)) return apiError("Enter a same-site image path ending in AVIF, GIF, JPEG, PNG or WebP.", 422);
  if (requestedPhotoKey && !photoAlt) return apiError("Add alternative text when a photograph asset is supplied.", 422);
  const now = Math.max(Date.now(), current.updated_at + 1);
  let uploadedKey: string | null = null;
  let photoKey = normaliseTeamPhotoPath(requestedPhotoKey) ?? null;
  if (photo) {
    let inspected: Awaited<ReturnType<typeof inspectTeamPhoto>>;
    try {
      inspected = await inspectTeamPhoto(photo);
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "The photograph is invalid.", 422);
    }
    const assetId = `${crypto.randomUUID()}.${inspected.extension}`;
    photoKey = managedTeamPhotoPath(id, assetId);
    if (!photoKey) return apiError("The photograph could not be stored safely.", 500);
    uploadedKey = `private/team-assets/${id}/${assetId}`;
    await privateFiles().put(uploadedKey, inspected.bytes, {
      httpMetadata: { contentType: inspected.contentType },
      customMetadata: {
        teamMemberId: id,
        uploadedBy: auth.actor.id,
        originalFilename: photo.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120),
        width: String(inspected.width),
        height: String(inspected.height),
      },
    });
  }
  try {
    const db = database();
    const results = await db.batch([
      db.prepare(
        `UPDATE team_members SET name = ?, role = ?, group_name = ?, photo_key = ?, photo_alt = ?,
          biography = ?, linkedin_url = ?, display_order = ?, active = ?, updated_at = ?
         WHERE id = ? AND updated_at = ? AND photo_key IS ?`,
      ).bind(
        name,
        role,
        group,
        photoKey,
        photoKey ? photoAlt || null : null,
        biography,
        linkedInUrl || null,
        displayOrder,
        active ? 1 : 0,
        now,
        id,
        expectedUpdatedAt,
        current.photo_key,
      ),
      db.prepare(
        `INSERT INTO audit_log
         (id, actor_id, action, entity_type, entity_id, metadata, created_at)
         SELECT ?, ?, 'team_member.updated', 'team_member', ?, ?, ?
         FROM team_members
         WHERE id = ? AND updated_at = ? AND photo_key IS ?`,
      ).bind(
        createId("audit"),
        auth.actor.id,
        id,
        JSON.stringify({
          fromActive: Boolean(current.active),
          toActive: active,
        }),
        now,
        id,
        now,
        photoKey,
      ),
    ]);
    if (
      (results[0]?.meta.changes ?? 0) !== 1 ||
      (results[1]?.meta.changes ?? 0) !== 1
    ) {
      if (uploadedKey) await privateFiles().delete(uploadedKey);
      return apiError(
        "This team member changed while you were saving. Reload and try again.",
        409,
      );
    }
  } catch (error) {
    if (uploadedKey) await privateFiles().delete(uploadedKey);
    throw error;
  }
  if (current.photo_key && current.photo_key !== photoKey) {
    const oldKey = managedTeamPhotoKey(current.photo_key);
    if (oldKey) {
      const stillReferenced = await database()
        .prepare("SELECT 1 AS present FROM team_members WHERE photo_key = ? LIMIT 1")
        .bind(current.photo_key)
        .first<{ present: number }>();
      if (!stillReferenced) await privateFiles().delete(oldKey);
    }
  }
  return Response.json({ ok: true, message: "Team member saved." });
}
