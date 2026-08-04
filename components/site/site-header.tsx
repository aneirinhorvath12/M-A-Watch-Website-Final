"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/apply", label: "Apply" },
  { href: "/team", label: "Team" },
  { href: "/info", label: "Info" },
];

const reportNavigation = [
  {
    href: "/reports/strategic",
    label: "Strategic Deal Reports",
    description: "Commercial and financial analysis",
  },
  {
    href: "/reports/legal",
    label: "Legal Reports",
    description: "Law, regulation and landmark cases",
  },
  {
    href: "/markets",
    label: "Markets",
    description: "Newsletters across global markets",
  },
];

function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [applicationsOpen, setApplicationsOpen] = useState<boolean | null>(null);
  const reportsCurrent =
    pathname === "/reports" ||
    pathname.startsWith("/reports/") ||
    pathname.startsWith("/markets");

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/applications/status", { signal: controller.signal })
      .then(async (response): Promise<{ open?: boolean } | null> =>
        response.ok ? (await response.json()) as { open?: boolean } : null,
      )
      .then((value) => {
        if (typeof value?.open === "boolean") setApplicationsOpen(value.open);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <div className="site-notice">
          <div className="site-shell site-notice__inner">
            <span>Student-led insight into history&apos;s most impactful deals</span>
            <Link href="/apply" onClick={closeMenu}>
              <span aria-atomic="true" aria-live="polite" role="status">
                {applicationsOpen === null
                  ? "View application information"
                  : applicationsOpen
                    ? "2026 applications open"
                    : "Applications currently closed"}
              </span>{" "}<span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div className="site-shell site-nav-shell">
          <Link className="site-brand" href="/" onClick={closeMenu} aria-label="M&A Watch home">
            <Image
              className="site-brand__mark"
              src="/brand/logo-black-mark.png"
              width={36}
              height={39}
              alt=""
              priority
            />
            <span>M&amp;A Watch</span>
          </Link>

          <button
            className="menu-button"
            type="button"
            aria-controls="primary-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="sr-only">{menuOpen ? "Close" : "Open"} navigation</span>
            <span className="menu-button__lines" aria-hidden="true">
              <span />
              <span />
            </span>
          </button>

          <nav
            id="primary-navigation"
            className={`primary-nav${menuOpen ? " primary-nav--open" : ""}`}
            aria-label="Primary navigation"
          >
            <ul className="primary-nav__list">
              <li>
                <Link
                  className="primary-nav__link"
                  href="/"
                  aria-current={pathname === "/" ? "page" : undefined}
                  onClick={closeMenu}
                >
                  Home
                </Link>
              </li>
              <li className="reports-menu">
                <details>
                  <summary
                    className={`primary-nav__link${reportsCurrent ? " is-current" : ""}`}
                    aria-current={reportsCurrent ? "page" : undefined}
                  >
                    Reports <span className="reports-menu__chevron" aria-hidden="true">⌄</span>
                  </summary>
                  <div className="reports-menu__panel">
                    {reportNavigation.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={isCurrent(pathname, item.href) ? "is-current" : undefined}
                        aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                        onClick={closeMenu}
                      >
                        <span>{item.label}</span>
                        <small>{item.description}</small>
                      </Link>
                    ))}
                  </div>
                </details>
              </li>
              {navigation.slice(1).map((item) => (
                <li key={item.href}>
                  <Link
                    className="primary-nav__link"
                    href={item.href}
                    aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                    onClick={closeMenu}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
    </>
  );
}
