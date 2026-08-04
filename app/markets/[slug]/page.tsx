import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketsPublicationPage } from "@/components/publications";
import {
  getLivePublicPublication,
} from "@/lib/publications";
import { publicationSocialImage } from "@/lib/seo";

export const dynamic = "force-dynamic";

interface MarketsPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: MarketsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const publication = await getLivePublicPublication("markets", slug);
  if (!publication || publication.type !== "markets") {
    return { title: "Markets issue not found", robots: { index: false, follow: false } };
  }
  const canonical = `/markets/${publication.slug}`;
  const socialImage = publicationSocialImage(publication);
  return {
    title: publication.title,
    description: publication.summary,
    alternates: { canonical },
    openGraph: {
      title: publication.title,
      description: publication.summary,
      type: "article",
      publishedTime: publication.publishedAt,
      modifiedTime: publication.updatedAt,
      authors: publication.authors,
      url: canonical,
      images: [socialImage],
    },
    twitter: { card: "summary_large_image", title: publication.title, description: publication.summary, images: [socialImage] },
  };
}

export default async function MarketsIssuePage({ params }: MarketsPageProps) {
  const { slug } = await params;
  const publication = await getLivePublicPublication("markets", slug);
  if (!publication || publication.type !== "markets") notFound();
  return <MarketsPublicationPage publication={publication} />;
}
