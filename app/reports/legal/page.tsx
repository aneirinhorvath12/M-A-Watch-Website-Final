import type { Metadata } from "next";
import { PublicationCollectionPage } from "@/components/publications";
import {
  getLivePublicationFilters,
  parsePublicationSearchParams,
  searchLivePublishedPublications,
  type PublicationSearchParams,
} from "@/lib/publications";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Legal Reports",
  description:
    "Explore accessible student analysis of the legal frameworks, drafting questions and regulatory issues affecting transactions.",
  alternates: { canonical: "/reports/legal" },
  openGraph: {
    title: "Legal Reports | M&A Watch",
    description: "Student-led analysis where transaction strategy meets deal law.",
    type: "website",
    url: "/reports/legal",
  },
};

export default async function LegalReportsPage({
  searchParams,
}: {
  searchParams: Promise<PublicationSearchParams>;
}) {
  const parsed = parsePublicationSearchParams(await searchParams);
  const query = { ...parsed, type: undefined };
  const [result, filters] = await Promise.all([
    searchLivePublishedPublications({ ...query, type: "legal", pageSize: 6 }),
    getLivePublicationFilters("legal"),
  ]);

  return (
    <PublicationCollectionPage
      activeType="legal"
      basePath="/reports/legal"
      eyebrow="Legal Reports"
      filters={filters}
      introduction="Clear, commercially minded analysis of the legal mechanics, regulatory questions and negotiated choices that determine whether deals get done."
      query={query}
      result={result}
      title="Deal law, without the distance."
    />
  );
}
