import type { Metadata } from "next";
import { InfoPageContentView } from "@/components/site/info-page-content";
import { getPublishedInfoPage } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublishedInfoPage();
  return {
    title: content.seo.title,
    description: content.seo.description,
    alternates: { canonical: "/info" },
  };
}

export default async function InfoPage() {
  return <InfoPageContentView content={await getPublishedInfoPage()} />;
}
