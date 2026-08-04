import Link from "next/link";
import { adminStyles as styles } from "@/components/admin/AdminUI";

export default function AdminNotFound() {
  return (
    <section className={styles.panel}>
      <div className={styles.empty}>
        <h1 className={styles.emptyTitle}>Administrative record not found</h1>
        <p className={styles.emptyText}>It may have moved, or the link may no longer identify a record available to this account.</p>
        <div className={styles.buttonRow} style={{ justifyContent: "center", marginTop: "1rem" }}>
          <Link className={styles.button} href="/admin">Return to overview</Link>
        </div>
      </div>
    </section>
  );
}
