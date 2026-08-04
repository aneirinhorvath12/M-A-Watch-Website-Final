import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticlePublicationPage } from "@/components/publications";
import {
  getLivePublicArticlePublication,
} from "@/lib/publications";
import { publicationSocialImage } from "@/lib/seo";

export const dynamic = "force-dynamic";

interface ReportPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ReportPageProps): Promise<Metadata> {
  const { slug } = await params;
  const publication = await getLivePublicArticlePublication("strategic", slug);
  if (!publication) return { title: "Report not found", robots: { index: false, follow: false } };
  const canonical = `/reports/strategic/${publication.slug}`;
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

export default async function StrategicReportPage({ params }: ReportPageProps) {
  const { slug } = await params;
  const publication = await getLivePublicArticlePublication("strategic", slug);
  if (!publication) notFound();
  return <ArticlePublicationPage publication={publication} />;
}
