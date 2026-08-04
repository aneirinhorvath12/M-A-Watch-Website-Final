import type { Publication, PublicationType } from "@/lib/publications/types";

const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export function absoluteSiteUrl(path: string): string {
  const configuredBase = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mawatch.org";
  try {
    return new URL(path, `${configuredBase.replace(/\/$/, "")}/`).toString();
  } catch {
    return new URL(path, "https://mawatch.org").toString();
  }
}

export function publicationTypeSocialLabel(type: PublicationType): string {
  if (type === "strategic") return "Strategic Deal Report";
  if (type === "legal") return "Legal Report";
  return "Markets Briefing";
}

export function publicationSocialImagePath(
  publication: Pick<Publication, "slug" | "type">,
): string {
  return `/social/publications/${publication.type}/${encodeURIComponent(publication.slug)}`;
}

export function publicationSocialImage(
  publication: Pick<Publication, "slug" | "title" | "type">,
) {
  return {
    url: publicationSocialImagePath(publication),
    ...SOCIAL_IMAGE_SIZE,
    alt: `${publication.title} — ${publicationTypeSocialLabel(publication.type)} by M&A Watch`,
  };
}
