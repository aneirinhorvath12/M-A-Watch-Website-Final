import Link from "next/link";
import { chatGPTSignOutPath } from "@/app/chatgpt-auth";
import type { AdminActor } from "@/lib/admin-auth";
import { AdminNav } from "./AdminNav";
import styles from "./admin.module.css";

export function AdminShell({ actor, children }: { actor: AdminActor; children: React.ReactNode }) {
  return (
    <div className={styles.adminRoot}>
      <a className={styles.skipLink} href="#admin-content">Skip to content</a>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <Link href="/admin" className={styles.brand} aria-label="M&A Watch administration home">
            <span className={styles.brandMark} aria-hidden="true">M&amp;A</span>
            <span className={styles.brandText}>
              <strong>M&amp;A Watch</strong>
              <span>Administration</span>
            </span>
          </Link>
          <AdminNav superUser={actor.role === "super_user"} />
          <div className={styles.account}>
            <div className={styles.accountName}>{actor.name}</div>
            <div className={styles.accountMeta}>
              {actor.role === "super_user" ? "Super User" : "Admin"} · {actor.email}
            </div>
            <a className={styles.signOut} href={chatGPTSignOutPath("/")}>Sign out</a>
          </div>
        </aside>
        <main id="admin-content" className={styles.main} tabIndex={-1}>
          <div className={styles.content}>{children}</div>
        </main>
      </div>
    </div>
  );
}
