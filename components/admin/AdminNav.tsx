"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./admin.module.css";

type NavItem = { href: string; label: string; glyph: string };

const OPERATIONS: NavItem[] = [
  { href: "/admin", label: "Overview", glyph: "OV" },
  { href: "/admin/publications", label: "Publications", glyph: "PB" },
  { href: "/admin/applicants", label: "Applicants", glyph: "AP" },
  { href: "/admin/application-settings", label: "Applications", glyph: "AS" },
];

const WEBSITE: NavItem[] = [
  { href: "/admin/team", label: "Team", glyph: "TM" },
  { href: "/admin/content", label: "Page content", glyph: "CT" },
];

const GOVERNANCE: NavItem[] = [
  { href: "/admin/audit-log", label: "Audit history", glyph: "AU" },
];

function active(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Links({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return items.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className={`${styles.navLink} ${active(pathname, item.href) ? styles.navLinkActive : ""}`}
      aria-current={active(pathname, item.href) ? "page" : undefined}
    >
      <span className={styles.navGlyph} aria-hidden="true">{item.glyph}</span>
      {item.label}
    </Link>
  ));
}

export function AdminNav({ superUser }: { superUser: boolean }) {
  return (
    <nav className={styles.nav} aria-label="Administration">
      <p className={styles.navSection}>Operations</p>
      <Links items={OPERATIONS} />
      <p className={styles.navSection}>Website</p>
      <Links items={WEBSITE} />
      <p className={styles.navSection}>Governance</p>
      {superUser ? <Links items={[{ href: "/admin/users", label: "User accounts", glyph: "US" }]} /> : null}
      <Links items={GOVERNANCE} />
    </nav>
  );
}
