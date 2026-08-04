import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest, readJsonObject, stringValue } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import { database } from "@/lib/platform";

function validUrl(value: string): boolean {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  const payload = await readJsonObject(request);
  if (!payload) return apiError("The team member update could not be read.", 400);
  const { id } = await params;
  await ensureDatabase();
  const current = await database().prepare("SELECT * FROM team_members WHERE id = ? LIMIT 1").bind(id).first<{
    name: string; role: string; group_name: string; photo_key: string | null; photo_alt: string | null;
    biography: string; linkedin_url: string | null; display_order: number; active: number;
  }>();
  if (!current) return apiError("Team member not found.", 404);
  const name = payload.name === undefined ? current.name : stringValue(payload.name, 120);
  const role = payload.role === undefined ? current.role : stringValue(payload.role, 160);
  const group = payload.groupName === undefined ? current.group_name : stringValue(payload.groupName, 120);
  const biography = payload.biography === undefined ? current.biography : stringValue(payload.biography, 1_500);
  const linkedInUrl = payload.linkedInUrl === undefined ? current.linkedin_url ?? "" : stringValue(payload.linkedInUrl, 500);
  const photoKey = payload.photoKey === undefined ? current.photo_key ?? "" : stringValue(payload.photoKey, 500);
  const photoAlt = payload.photoAlt === undefined ? current.photo_alt ?? "" : stringValue(payload.photoAlt, 220);
  const displayOrder = payload.displayOrder === undefined ? current.display_order : Math.max(0, Math.min(10_000, Number.parseInt(stringValue(payload.displayOrder, 8) || "0", 10) || 0));
  const active = payload.activePresent === undefined ? Boolean(current.active) : ["on", "true", true].includes(payload.active as never);
  if (name.length < 2 || !role || !group) return apiError("Name, role and team/group are required.", 422);
  if (!validUrl(linkedInUrl)) return apiError("Enter a valid LinkedIn URL.", 422);
  if (photoKey && !photoAlt) return apiError("Add alternative text when a photograph asset is supplied.", 422);
  const now = Date.now();
  await database().prepare(
    `UPDATE team_members SET name = ?, role = ?, group_name = ?, photo_key = ?, photo_alt = ?,
      biography = ?, linkedin_url = ?, display_order = ?, active = ?, updated_at = ? WHERE id = ?`,
  ).bind(name, role, group, photoKey || null, photoAlt || null, biography, linkedInUrl || null, displayOrder, active ? 1 : 0, now, id).run();
  await writeAudit({ actorId: auth.actor.id, action: "team_member.updated", entityType: "team_member", entityId: id, metadata: { fromActive: Boolean(current.active), toActive: active } });
  return Response.json({ ok: true, message: "Team member saved." });
}
