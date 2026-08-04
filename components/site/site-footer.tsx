"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  coerceManagedContent,
  DEFAULT_SITE_CONTACT,
  type SiteContactContent,
} from "@/lib/site-content";

const reportLinks = [
  ["Strategic Deal Reports", "/reports/strategic"],
  ["Legal Reports", "/reports/legal"],
  ["Markets", "/markets"],
] as const;

const organisationLinks = [
  ["About M&A Watch", "/info"],
  ["Our team", "/team"],
  ["Apply", "/apply"],
  ["Admin sign in", "/admin/login"],
] as const;

export function SiteFooter({
  initialContent = DEFAULT_SITE_CONTACT,
  loadPublished = true,
}: {
  initialContent?: SiteContactContent;
  loadPublished?: boolean;
} = {}) {
  const [contact, setContact] = useState<SiteContactContent>(initialContent);

  useEffect(() => {
    if (!loadPublished) return;
    const controller = new AbortController();
    fetch("/api/content/site.contact", { signal: controller.signal })
      .then(async (response): Promise<unknown> => response.ok ? response.json() : null)
      .then((value) => {
        if (!value) return;
        setContact(coerceManagedContent("site.contact", value) as SiteContactContent);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [loadPublished]);

  return (
    <footer className="site-footer">
      <div className="site-shell site-footer__top">
        <div className="site-footer__brand">
          <Link href="/" className="site-brand site-brand--footer" aria-label="M&A Watch home">
            <Image
              className="site-brand__mark"
              src="/brand/logo-white-mark.png"
              width={36}
              height={39}
              alt=""
            />
            <span>M&amp;A Watch</span>
          </Link>
          <p>{contact.body}</p>
          <a className="site-footer__email" href={`mailto:${contact.email}`}>
            {contact.emailLabel}
          </a>
          {contact.socialLinks.length ? (
            <ul className="site-footer__social" aria-label="M&A Watch social channels">
              {contact.socialLinks.map((social) => (
                <li key={`${social.label}-${social.href}`}>
                  <a href={social.href} rel="noreferrer">{social.label}</a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="site-footer__links">
          <div>
            <h2>Explore</h2>
            <ul>
              {reportLinks.map(([label, href]) => (
                <li key={href}><Link href={href}>{label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Organisation</h2>
            <ul>
              {organisationLinks.map(([label, href]) => (
                <li key={href}><Link href={href}>{label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Policies</h2>
            <ul>
              <li><Link href="/privacy">Privacy</Link></li>
              <li><Link href="/terms">Terms &amp; disclaimer</Link></li>
              <li><Link href="/accessibility">Accessibility</Link></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="site-shell site-footer__bottom">
        <p>© {new Date().getFullYear()} M&amp;A Watch. All rights reserved.</p>
        <p>Independent analysis. Not investment or legal advice.</p>
      </div>
    </footer>
  );
}
