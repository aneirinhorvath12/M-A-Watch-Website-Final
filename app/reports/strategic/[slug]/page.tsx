import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticlePublicationPage } from "@/components/publications";
import {
  getLivePublicArticlePublication,
  getPublishedPublications,
} from "@/lib/publications";

export const dynamic = "force-dynamic";

interface ReportPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getPublishedPublications("strategic").map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: ReportPageProps): Promise<Metadata> {
  const { slug } = await params;
  const publication = await getLivePublicArticlePublication("strategic", slug);
  if (!publication) return { title: "Report not found | M&A Watch" };
  const canonical = `/reports/strategic/${publication.slug}`;
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
      authors: publication.authors,
      url: canonical,
    },
  };
}

export default async function StrategicReportPage({ params }: ReportPageProps) {
  const { slug } = await params;
  const publication = await getLivePublicArticlePublication("strategic", slug);
  if (!publication) notFound();
  return <ArticlePublicationPage publication={publication} />;
}
