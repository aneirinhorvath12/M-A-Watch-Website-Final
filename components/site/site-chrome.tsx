"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AnalyticsTracker } from "./analytics-tracker";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";

  if (pathname.startsWith("/admin")) {
    return children;
  }

  const contentIncludesFooterPreview = pathname === "/preview/content/footer";

  return (
    <>
      <AnalyticsTracker />
      <SiteHeader />
      <div id="main-content" tabIndex={-1} className="site-main">
        {children}
      </div>
      {contentIncludesFooterPreview ? null : <SiteFooter />}
    </>
  );
}
