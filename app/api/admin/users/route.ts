import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest, readJsonObject, stringValue } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import { queueEmail } from "@/lib/email-queue";
import { createId, database, normaliseEmail } from "@/lib/platform";

export const dynamic = "force-dynamic";

async function tokenHash(): Promise<string> {
  const token = crypto.randomUUID();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request, { superUser: true });
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const users = await database().prepare(
    `SELECT id, name, email, role, status, invitation_expires_at, last_login_at, created_at, updated_at
     FROM admin_users ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END, name COLLATE NOCASE`,
  ).all();
  return Response.json({ ok: true, users: users.results });
}

export async function POST(request: Request) {
  const auth = await authorizeAdminRequest(request, { superUser: true, mutation: true });
  if (!auth.ok) return auth.response;
  const payload = await readJsonObject(request);
  if (!payload) return apiError("The invitation could not be read.", 400);
  const name = stringValue(payload.name, 120);
  const email = normaliseEmail(stringValue(payload.email, 254));
  const role = stringValue(payload.role, 30);
  if (name.length < 2) return apiError("Enter the invitee’s name.", 422);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return apiError("Enter a valid email address.", 422);
  if (role !== "admin" && role !== "super_user") return apiError("Choose Admin or Super User.", 422);
  await ensureDatabase();
  const existing = await database().prepare("SELECT id FROM admin_users WHERE email = ? LIMIT 1").bind(email).first<{ id: string }>();
  if (existing) return apiError("An administrative account or invitation already uses this email address.", 409);
  const id = createId("user");
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
  const invitationUrl = new URL("/admin/login", request.url).toString();
  await database().prepare(
    `INSERT INTO admin_users
     (id, name, email, role, status, invitation_token_hash, invitation_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'invited', ?, ?, ?, ?)`,
  ).bind(id, name, email, role, await tokenHash(), expiresAt, now, now).run();
  await queueEmail({
    template: "account-invitation",
    to: [email],
    data: { name, role, invitationUrl, expiresAt: new Date(expiresAt).toISOString() },
  });
  await writeAudit({
    actorId: auth.actor.id,
    action: "account.invited",
    entityType: "admin_user",
    entityId: id,
    metadata: { role, deliveryStatus: "queued", expiresAt },
  });
  return Response.json({ ok: true, message: "Invitation created and queued for delivery." }, { status: 201 });
}
