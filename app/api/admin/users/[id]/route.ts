import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest, readJsonObject, stringValue } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import { queueEmail } from "@/lib/email-queue";
import { database } from "@/lib/platform";

type UserRow = {
  id: string;
  external_user_id: string | null;
  name: string;
  email: string;
  role: "admin" | "super_user";
  status: "invited" | "active" | "disabled";
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdminRequest(request, { superUser: true, mutation: true });
  if (!auth.ok) return auth.response;
  const payload = await readJsonObject(request);
  if (!payload) return apiError("The account change could not be read.", 400);
  const action = stringValue(payload.action, 30);
  const { id } = await params;
  await ensureDatabase();
  const target = await database().prepare(
    "SELECT id, external_user_id, name, email, role, status FROM admin_users WHERE id = ? LIMIT 1",
  ).bind(id).first<UserRow>();
  if (!target) return apiError("Administrative account not found.", 404);
  const confirmationRequired = ["set_role", "disable", "reactivate", "revoke"].includes(action);
  if (confirmationRequired && payload.confirmed !== "true") return apiError("Explicit confirmation is required for this account change.", 422);
  const now = Date.now();
  const invitationUrl = new URL("/admin/login", request.url).toString();
  let auditAction = "";
  let message = "Account updated.";
  let metadata: Record<string, unknown> = {};

  if (action === "resend") {
    if (target.status !== "invited") return apiError("Only a pending invitation can be resent.", 409);
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    await database().prepare("UPDATE admin_users SET invitation_expires_at = ?, updated_at = ? WHERE id = ? AND status = 'invited'").bind(expiresAt, now, id).run();
    await queueEmail({ template: "account-invitation", to: [target.email], data: { name: target.name, role: target.role, invitationUrl, expiresAt: new Date(expiresAt).toISOString() } });
    auditAction = "account.invitation_resent";
    message = "Invitation queued again with a new seven-day expiry.";
    metadata = { deliveryStatus: "queued", expiresAt };
  } else if (action === "revoke") {
    if (target.status !== "invited") return apiError("Only a pending invitation can be revoked.", 409);
    await database().prepare(
      "UPDATE admin_users SET status = 'disabled', invitation_token_hash = NULL, invitation_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'invited'",
    ).bind(now, id).run();
    auditAction = "account.invitation_revoked";
    message = "Pending invitation revoked; the account record remains in history.";
  } else if (action === "disable") {
    if (id === auth.actor.id) return apiError("You cannot disable your own signed-in account.", 409);
    if (target.status === "disabled") return apiError("This account is already disabled.", 409);
    const result = await database().prepare(
      `UPDATE admin_users SET status = 'disabled', invitation_token_hash = NULL,
         invitation_expires_at = NULL, updated_at = ?
       WHERE id = ? AND id != ?
         AND NOT (role = 'super_user' AND status = 'active' AND
           (SELECT COUNT(*) FROM admin_users WHERE role = 'super_user' AND status = 'active') <= 1)`,
    ).bind(now, id, auth.actor.id).run();
    if ((result.meta.changes ?? 0) !== 1) return apiError("The final active Super User cannot be disabled.", 409);
    await queueEmail({ template: "account-disabled", to: [target.email], data: { name: target.name } });
    auditAction = "account.disabled";
    message = "Account disabled. Its next administrative request will be denied; the notification is queued.";
    metadata = { notificationStatus: "queued" };
  } else if (action === "reactivate") {
    if (target.status !== "disabled") return apiError("Only a disabled account can be reactivated.", 409);
    const nextStatus = target.external_user_id ? "active" : "invited";
    const expiresAt = nextStatus === "invited" ? now + 7 * 24 * 60 * 60 * 1000 : null;
    await database().prepare(
      "UPDATE admin_users SET status = ?, invitation_expires_at = ?, updated_at = ? WHERE id = ? AND status = 'disabled'",
    ).bind(nextStatus, expiresAt, now, id).run();
    if (nextStatus === "invited") {
      await queueEmail({ template: "account-invitation", to: [target.email], data: { name: target.name, role: target.role, invitationUrl, expiresAt: new Date(expiresAt as number).toISOString() } });
    }
    auditAction = "account.reactivated";
    message = nextStatus === "active" ? "Account reactivated." : "Account returned to invited status and an invitation was queued.";
    metadata = { status: nextStatus, deliveryStatus: nextStatus === "invited" ? "queued" : "not_required" };
  } else if (action === "set_role") {
    const role = stringValue(payload.role, 30);
    if (role !== "admin" && role !== "super_user") return apiError("Choose Admin or Super User.", 422);
    if (role === target.role) return Response.json({ ok: true, message: "Role is already up to date." });
    const result = await database().prepare(
      `UPDATE admin_users SET role = ?, updated_at = ? WHERE id = ?
       AND NOT (? = 'admin' AND role = 'super_user' AND status = 'active' AND
         (SELECT COUNT(*) FROM admin_users WHERE role = 'super_user' AND status = 'active') <= 1)`,
    ).bind(role, now, id, role).run();
    if ((result.meta.changes ?? 0) !== 1) return apiError("The final active Super User cannot be demoted.", 409);
    auditAction = "account.role_changed";
    message = `Account role changed to ${role === "super_user" ? "Super User" : "Admin"}.`;
    metadata = { fromRole: target.role, toRole: role };
  } else {
    return apiError("Unsupported account action.", 400);
  }

  await writeAudit({ actorId: auth.actor.id, action: auditAction, entityType: "admin_user", entityId: id, metadata });
  return Response.json({ ok: true, message });
}
