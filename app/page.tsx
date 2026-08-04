import type { Metadata } from "next";
import { HomePageContent } from "@/components/site/home-page-content";
import { getLiveFeaturedPublications } from "@/lib/publications";
import {
  getPublishedBasicContent,
  getPublishedHomepageEditorial,
  getPublicApplicationSettings,
} from "@/lib/public-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublishedHomepageEditorial();
  return {
    title: content.seo.title,
    description: content.seo.description,
    alternates: { canonical: "/" },
  };
}

export default async function Home() {
  const [
    featured,
    heroContent,
    overviewContent,
    editorialContent,
    applicationSettings,
  ] = await Promise.all([
    getLiveFeaturedPublications(3),
    getPublishedBasicContent("homepage.hero"),
    getPublishedBasicContent("homepage.overview"),
    getPublishedHomepageEditorial(),
    getPublicApplicationSettings(),
  ]);

  return (
    <HomePageContent
      featured={featured}
      heroContent={heroContent}
      overviewContent={overviewContent}
      editorialContent={editorialContent}
      applicationSettings={applicationSettings}
    />
  );
}
