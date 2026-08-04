import type { MetadataRoute } from "next";
import { getLivePublishedPublications, getPublicationHref } from "@/lib/publications";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mawatch.org";
  const now = new Date();
  const staticPages = ["", "/reports/strategic", "/reports/legal", "/markets", "/apply", "/team", "/info", "/privacy", "/terms", "/accessibility"];

  return [
    ...staticPages.map((path) => ({
      url: `${base}${path}`,
      lastModified: now,
      changeFrequency: path === "" ? "weekly" as const : "monthly" as const,
      priority: path === "" ? 1 : path.includes("reports") || path === "/markets" ? 0.8 : 0.6,
    })),
    ...(await getLivePublishedPublications()).map((publication) => ({
      url: `${base}${getPublicationHref(publication)}`,
      lastModified: new Date(publication.updatedAt),
      changeFrequency: "monthly" as const,
      priority: publication.featured ? 0.8 : 0.7,
    })),
  ];
}
