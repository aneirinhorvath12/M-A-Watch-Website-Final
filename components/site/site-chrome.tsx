"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";

  if (pathname.startsWith("/admin")) {
    return children;
  }

  return (
    <>
      <SiteHeader />
      <div id="main-content" tabIndex={-1} className="site-main">
        {children}
      </div>
      <SiteFooter />
    </>
  );
}
