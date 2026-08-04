import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest, stringValue } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import { createId, database, privateFiles } from "@/lib/platform";
import {
  inspectTeamPhoto,
  isValidLinkedInUrl,
  managedTeamPhotoPath,
  normaliseTeamPhotoPath,
  readTeamMemberRequest,
} from "@/lib/team-media";

export async function POST(request: Request) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  const input = await readTeamMemberRequest(request);
  if (!input.ok) return apiError(input.error, input.status);
  const { payload, photo } = input.value;
  const name = stringValue(payload.name, 120);
  const role = stringValue(payload.role, 160);
  const group = stringValue(payload.groupName, 120);
  const biography = stringValue(payload.biography, 1_500);
  const linkedInUrl = stringValue(payload.linkedInUrl, 500);
  const requestedPhotoKey = stringValue(payload.photoKey, 500);
  const photoAlt = stringValue(payload.photoAlt, 220);
  const displayOrder = Math.max(0, Math.min(10_000, Number.parseInt(stringValue(payload.displayOrder, 8) || "0", 10) || 0));
  if (name.length < 2 || !role || !group) return apiError("Name, role and team/group are required.", 422);
  if (!isValidLinkedInUrl(linkedInUrl)) return apiError("Enter a valid HTTPS LinkedIn URL.", 422);
  if (photo && !photoAlt) return apiError("Add alternative text before uploading the photograph.", 422);
  if (requestedPhotoKey.startsWith("/api/team/images/")) {
    return apiError("Upload the photograph for this team member instead of reusing another managed asset.", 422);
  }
  if (requestedPhotoKey && !normaliseTeamPhotoPath(requestedPhotoKey)) return apiError("Enter a same-site image path ending in AVIF, GIF, JPEG, PNG or WebP.", 422);
  if (requestedPhotoKey && !photoAlt) return apiError("Add alternative text when a photograph asset is supplied.", 422);
  await ensureDatabase();
  const id = createId("team");
  const now = Date.now();
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
    await database().prepare(
      `INSERT INTO team_members
       (id, name, role, group_name, photo_key, photo_alt, biography, linkedin_url, display_order, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(id, name, role, group, photoKey, photoAlt || null, biography, linkedInUrl || null, displayOrder, now, now).run();
  } catch (error) {
    if (uploadedKey) await privateFiles().delete(uploadedKey);
    throw error;
  }
  await writeAudit({ actorId: auth.actor.id, action: "team_member.created", entityType: "team_member", entityId: id });
  return Response.json({ ok: true, message: "Team member created." }, { status: 201 });
}
