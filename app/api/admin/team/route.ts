import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest, readJsonObject, stringValue } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import { createId, database } from "@/lib/platform";

function validUrl(value: string): boolean {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; }
}

export async function POST(request: Request) {
  const auth = await authorizeAdminRequest(request, { mutation: true });
  if (!auth.ok) return auth.response;
  const payload = await readJsonObject(request);
  if (!payload) return apiError("The team member could not be read.", 400);
  const name = stringValue(payload.name, 120);
  const role = stringValue(payload.role, 160);
  const group = stringValue(payload.groupName, 120);
  const biography = stringValue(payload.biography, 1_500);
  const linkedInUrl = stringValue(payload.linkedInUrl, 500);
  const photoKey = stringValue(payload.photoKey, 500);
  const photoAlt = stringValue(payload.photoAlt, 220);
  const displayOrder = Math.max(0, Math.min(10_000, Number.parseInt(stringValue(payload.displayOrder, 8) || "0", 10) || 0));
  if (name.length < 2 || !role || !group) return apiError("Name, role and team/group are required.", 422);
  if (!validUrl(linkedInUrl)) return apiError("Enter a valid LinkedIn URL.", 422);
  if (photoKey && !photoAlt) return apiError("Add alternative text when a photograph asset is supplied.", 422);
  await ensureDatabase();
  const id = createId("team");
  const now = Date.now();
  await database().prepare(
    `INSERT INTO team_members
     (id, name, role, group_name, photo_key, photo_alt, biography, linkedin_url, display_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).bind(id, name, role, group, photoKey || null, photoAlt || null, biography, linkedInUrl || null, displayOrder, now, now).run();
  await writeAudit({ actorId: auth.actor.id, action: "team_member.created", entityType: "team_member", entityId: id });
  return Response.json({ ok: true, message: "Team member created." }, { status: 201 });
}
