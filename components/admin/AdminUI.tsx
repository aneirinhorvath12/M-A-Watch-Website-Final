import styles from "./admin.module.css";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.pageTitle}>{title}</h1>
        {description ? <p className={styles.pageDescription}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.headerActions}>{actions}</div> : null}
    </header>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const normalised = value.toLowerCase().replace(/\s+/g, "_");
  const good = ["active", "published", "accepted", "open", "succeeded"].includes(normalised);
  const danger = ["disabled", "rejected", "parse_failed", "failed", "closed"].includes(normalised);
  const warning = ["invited", "review", "scheduled", "parsing", "uploaded", "new", "queued"].includes(normalised);
  const tone = good ? styles.statusGood : danger ? styles.statusDanger : warning ? styles.statusWarning : "";
  return <span className={`${styles.status} ${tone}`}>{value.replace(/_/g, " ")}</span>;
}

export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.empty}>
      <h2 className={styles.emptyTitle}>{title}</h2>
      <div className={styles.emptyText}>{children}</div>
    </div>
  );
}

export function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {meta ? <div className={styles.panelMeta}>{meta}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function StatCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {note ? <div className={styles.statNote}>{note}</div> : null}
    </div>
  );
}

export { styles as adminStyles };
