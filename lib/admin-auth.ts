import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureDatabase } from "@/db/bootstrap";
import { writeAudit } from "@/lib/audit";
import { createId, database, normaliseEmail } from "@/lib/platform";

export type AdminRole = "admin" | "super_user";
export type AdminStatus = "invited" | "active" | "disabled";

export type AdminActor = {
  id: string;
  externalUserId: string | null;
  name: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
};

type AdminRow = {
  id: string;
  external_user_id: string | null;
  name: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
  invitation_expires_at: number | null;
  last_login_at: number | null;
};

export async function getAdminActor(): Promise<AdminActor | null> {
  const identity = await getChatGPTUser();
  if (!identity) return null;

  await ensureDatabase();
  const email = normaliseEmail(identity.email);
  let row = await database()
    .prepare(
      `SELECT id, external_user_id, name, email, role, status,
              invitation_expires_at, last_login_at
       FROM admin_users WHERE external_user_id = ? OR email = ? LIMIT 1`,
    )
    .bind(identity.userId, email)
    .first<AdminRow>();

  if (!row) row = await bootstrapFirstSuperUser(identity.userId, identity.displayName, email);
  if (row?.external_user_id && row.external_user_id !== identity.userId) return null;
  if (row?.status === "invited") {
    row = await acceptEmailMatchedInvitation(row, identity.userId, identity.displayName);
  }
  if (!row || row.status !== "active") return null;

  const now = Date.now();
  const recordLogin = !row.last_login_at || now - row.last_login_at > 30 * 60 * 1000;
  if (recordLogin || row.external_user_id !== identity.userId || row.name !== identity.displayName) {
    await database()
      .prepare(
        `UPDATE admin_users
         SET external_user_id = COALESCE(external_user_id, ?), name = ?,
             last_login_at = ?, updated_at = ?
         WHERE id = ? AND status = 'active'`,
      )
      .bind(identity.userId, identity.displayName, now, now, row.id)
      .run();
    if (recordLogin) {
      await writeAudit({
        actorId: row.id,
        action: "account.login",
        entityType: "admin_user",
        entityId: row.id,
      });
    }
  }

  return mapActor({ ...row, external_user_id: identity.userId, name: identity.displayName });
}

export async function requireAdmin(returnTo = "/admin"): Promise<AdminActor> {
  const actor = await getAdminActor();
  if (!actor) redirect(`/admin/login?return_to=${encodeURIComponent(returnTo)}`);
  return actor;
}

export async function requireSuperUser(returnTo = "/admin/users"): Promise<AdminActor> {
  const actor = await requireAdmin(returnTo);
  if (actor.role !== "super_user") redirect("/admin?notice=permission-denied");
  return actor;
}

async function bootstrapFirstSuperUser(
  externalUserId: string,
  name: string,
  email: string,
): Promise<AdminRow | null> {
  const configuredEmail = normaliseEmail(env.INITIAL_SUPER_USER_EMAIL ?? "");
  if (!configuredEmail || email !== configuredEmail) return null;

  const id = createId("user");
  const now = Date.now();
  const result = await database()
    .prepare(
      `INSERT OR IGNORE INTO admin_users
       (id, external_user_id, name, email, role, status, last_login_at, created_at, updated_at)
       SELECT ?, ?, ?, ?, 'super_user', 'active', ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM admin_users)`,
    )
    .bind(id, externalUserId, name, email, now, now, now)
    .run();
  if ((result.meta.changes ?? 0) === 1) {
    await writeAudit({
      actorId: id,
      action: "account.bootstrap_super_user",
      entityType: "admin_user",
      entityId: id,
    });
  }

  return database()
    .prepare(
      `SELECT id, external_user_id, name, email, role, status,
              invitation_expires_at, last_login_at
       FROM admin_users WHERE email = ? AND external_user_id = ? AND status = 'active' LIMIT 1`,
    )
    .bind(configuredEmail, externalUserId)
    .first<AdminRow>();
}

async function acceptEmailMatchedInvitation(
  row: AdminRow,
  externalUserId: string,
  displayName: string,
): Promise<AdminRow | null> {
  const now = Date.now();
  if (!row.invitation_expires_at || row.invitation_expires_at < now) return null;

  const result = await database()
    .prepare(
      `UPDATE admin_users
       SET external_user_id = ?, name = ?, status = 'active',
           invitation_token_hash = NULL, invitation_expires_at = NULL,
           last_login_at = ?, updated_at = ?
       WHERE id = ? AND status = 'invited'
         AND invitation_expires_at IS NOT NULL AND invitation_expires_at >= ?`,
    )
    .bind(externalUserId, displayName, now, now, row.id, now)
    .run();
  if ((result.meta.changes ?? 0) !== 1) return null;

  await writeAudit({
    actorId: row.id,
    action: "account.invitation_accepted",
    entityType: "admin_user",
    entityId: row.id,
  });
  return {
    ...row,
    external_user_id: externalUserId,
    name: displayName,
    status: "active",
    invitation_expires_at: null,
    last_login_at: now,
  };
}

function mapActor(row: AdminRow): AdminActor {
  return {
    id: row.id,
    externalUserId: row.external_user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
  };
}
