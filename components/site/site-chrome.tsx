"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AnalyticsTracker } from "./analytics-tracker";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import type { SiteContactContent } from "@/lib/site-content";

export function SiteChrome({
  children,
  siteContact,
  applicationsOpen,
}: {
  children: ReactNode;
  siteContact: SiteContactContent;
  applicationsOpen: boolean | null;
}) {
  const pathname = usePathname() ?? "/";

  if (pathname.startsWith("/admin")) {
    return children;
  }

  const contentIncludesFooterPreview = pathname === "/preview/content/footer";

  return (
    <>
      <AnalyticsTracker />
      <SiteHeader applicationsOpen={applicationsOpen} />
      <div id="main-content" tabIndex={-1} className="site-main">
        {children}
      </div>
      {contentIncludesFooterPreview ? null : <SiteFooter content={siteContact} />}
    </>
  );
}
