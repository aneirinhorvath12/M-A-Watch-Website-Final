import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketsPublicationPage } from "@/components/publications";
import {
  getLivePublicPublication,
  getPublishedPublications,
} from "@/lib/publications";

export const dynamic = "force-dynamic";

interface MarketsPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getPublishedPublications("markets").map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: MarketsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const publication = await getLivePublicPublication("markets", slug);
  if (!publication || publication.type !== "markets") {
    return { title: "Markets issue not found | M&A Watch" };
  }
  const canonical = `/markets/${publication.slug}`;
  return {
    title: `${publication.title} | M&A Watch`,
    description: publication.summary,
    alternates: { canonical },
    openGraph: {
      title: publication.title,
      description: publication.summary,
      type: "article",
      publishedTime: publication.publishedAt,
      modifiedTime: publication.updatedAt,
      url: canonical,
    },
  };
}

export default async function MarketsIssuePage({ params }: MarketsPageProps) {
  const { slug } = await params;
  const publication = await getLivePublicPublication("markets", slug);
  if (!publication || publication.type !== "markets") notFound();
  return <MarketsPublicationPage publication={publication} />;
}
