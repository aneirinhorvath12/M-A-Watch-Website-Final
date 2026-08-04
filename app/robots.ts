import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mawatch.org";
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin/", "/preview/", "/api/", "/apply/confirmation"] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
