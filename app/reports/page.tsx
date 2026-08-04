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
  title: "Reports | M&A Watch",
  description:
    "Explore student-led Strategic Deal Reports, Legal Reports and Markets briefings from M&A Watch.",
  alternates: { canonical: "/reports" },
  openGraph: {
    title: "Reports | M&A Watch",
    description:
      "Independent student analysis of transactions, deal law and global markets.",
    type: "website",
    url: "/reports",
  },
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<PublicationSearchParams>;
}) {
  const query = parsePublicationSearchParams(await searchParams);
  const [result, filters] = await Promise.all([
    searchLivePublishedPublications({ ...query, pageSize: 6 }),
    getLivePublicationFilters(),
  ]);

  return (
    <PublicationCollectionPage
      basePath="/reports"
      eyebrow="Research library"
      filters={filters}
      introduction="Independent, student-led perspectives on transactions, the legal questions around them and the market forces behind capital allocation."
      query={query}
      result={result}
      showTypeFilter
      title="Ideas for the deals shaping tomorrow."
    />
  );
}
