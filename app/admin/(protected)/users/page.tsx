import { ActionForm } from "@/components/admin/ActionForm";
import { PageHeader, StatusBadge, adminStyles as styles } from "@/components/admin/AdminUI";
import { requireSuperUser } from "@/lib/admin-auth";
import { formatAdminDate, titleCaseStatus } from "@/lib/admin-data";
import { database } from "@/lib/platform";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "super_user";
  status: "invited" | "active" | "disabled";
  invitation_expires_at: number | null;
  last_login_at: number | null;
  created_at: number;
};

export default async function UsersPage() {
  const actor = await requireSuperUser("/admin/users");
  const users = await database().prepare(
    `SELECT id, name, email, role, status, invitation_expires_at, last_login_at, created_at
     FROM admin_users ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END, name COLLATE NOCASE`,
  ).all<UserRow>();
  const activeSupers = users.results.filter((user) => user.role === "super_user" && user.status === "active").length;

  return (
    <>
      <PageHeader eyebrow="Governance" title="User accounts" description="Invite and administer the people who can operate M&A Watch. Accounts are never permanently deleted, preserving attribution and audit history." />
      <div className={styles.noticeWarning}>Invitation and disabled-account messages are queued, but a transactional email provider still needs to be connected. Sign-in credentials and multi-factor authentication are managed by the secure identity provider.</div>
      <section className={styles.panel}>
        <div className={styles.panelHeader}><h2 className={styles.panelTitle}>Invite an administrator</h2><span className={styles.panelMeta}>Invitation expires after seven days</span></div>
        <div className={styles.panelBody}>
          <ActionForm action="/api/admin/users" submitLabel="Create invitation">
            <div className={styles.formGrid}>
              <div className={styles.fieldThird}><label className={styles.label} htmlFor="invite-name">Name</label><input className={styles.input} id="invite-name" name="name" required maxLength={120} /></div>
              <div className={styles.fieldThird}><label className={styles.label} htmlFor="invite-email">Email</label><input className={styles.input} id="invite-email" name="email" type="email" required maxLength={254} /></div>
              <div className={styles.fieldThird}><label className={styles.label} htmlFor="invite-role">Role</label><select className={styles.select} id="invite-role" name="role" defaultValue="admin"><option value="admin">Admin</option><option value="super_user">Super User</option></select></div>
            </div>
          </ActionForm>
        </div>
      </section>

      <section className={styles.panel} aria-label="Administrative accounts">
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Invitation</th><th>Controls</th></tr></thead>
            <tbody>
              {users.results.map((user) => {
                const finalActiveSuper = user.role === "super_user" && user.status === "active" && activeSupers === 1;
                const self = user.id === actor.id;
                return (
                  <tr key={user.id}>
                    <td><span className={styles.primaryCell}>{user.name}{self ? " (you)" : ""}</span><span className={styles.secondaryCell}>{user.email}</span></td>
                    <td>
                      {finalActiveSuper ? (
                        <><span>{titleCaseStatus(user.role)}</span><span className={styles.secondaryCell}>Protected role</span></>
                      ) : (
                        <ActionForm action={`/api/admin/users/${user.id}`} method="PATCH" submitLabel="Change role" buttonTone="quiet" confirmation={`Change ${user.name}’s account role?`}>
                          <input type="hidden" name="action" value="set_role" /><input type="hidden" name="confirmed" value="true" />
                          <select className={styles.select} name="role" defaultValue={user.role} aria-label={`Role for ${user.name}`}>
                            <option value="admin">Admin</option><option value="super_user">Super User</option>
                          </select>
                        </ActionForm>
                      )}
                    </td>
                    <td><StatusBadge value={titleCaseStatus(user.status)} />{finalActiveSuper ? <span className={styles.secondaryCell}>Final active Super User</span> : null}</td>
                    <td>{formatAdminDate(user.last_login_at, true)}</td>
                    <td>{user.status === "invited" ? formatAdminDate(user.invitation_expires_at, true) : "—"}</td>
                    <td>
                      <div className={styles.inlineActions}>
                        {user.status === "invited" ? <>
                          <ActionForm action={`/api/admin/users/${user.id}`} method="PATCH" submitLabel="Resend" buttonTone="quiet"><input type="hidden" name="action" value="resend" /></ActionForm>
                          <ActionForm action={`/api/admin/users/${user.id}`} method="PATCH" submitLabel="Revoke" buttonTone="danger" confirmation={`Revoke ${user.name}’s pending invitation?`}><input type="hidden" name="action" value="revoke" /><input type="hidden" name="confirmed" value="true" /></ActionForm>
                        </> : null}
                        {user.status === "active" && !self ? <ActionForm action={`/api/admin/users/${user.id}`} method="PATCH" submitLabel="Disable" buttonTone="danger" confirmation={`Disable ${user.name}? Their next administrative request will be denied.`}><input type="hidden" name="action" value="disable" /><input type="hidden" name="confirmed" value="true" /></ActionForm> : null}
                        {user.status === "disabled" ? <ActionForm action={`/api/admin/users/${user.id}`} method="PATCH" submitLabel="Reactivate" buttonTone="secondary" confirmation={`Reactivate ${user.name}?`}><input type="hidden" name="action" value="reactivate" /><input type="hidden" name="confirmed" value="true" /></ActionForm> : null}
                        {self ? <span className={styles.secondaryCell}>Self-disable unavailable</span> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
