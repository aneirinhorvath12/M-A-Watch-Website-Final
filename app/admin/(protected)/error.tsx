"use client";

import Link from "next/link";
import { adminStyles as styles } from "@/components/admin/AdminUI";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className={styles.panel} role="alert">
      <div className={styles.empty}>
        <h1 className={styles.emptyTitle}>This admin view could not be loaded</h1>
        <p className={styles.emptyText}>No change was made. Try the request again; if it continues, check the platform integration and failed-job status.</p>
        <div className={styles.buttonRow} style={{ justifyContent: "center", marginTop: "1rem" }}>
          <button className={styles.button} type="button" onClick={reset}>Try again</button>
          <Link className={styles.buttonSecondary} href="/admin">Return to overview</Link>
        </div>
      </div>
    </section>
  );
}
