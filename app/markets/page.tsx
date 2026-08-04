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
  title: "Markets",
  description:
    "Browse M&A Watch Markets briefings on the macro themes and asset-class movements shaping the deal environment.",
  alternates: { canonical: "/markets" },
  openGraph: {
    title: "Markets | M&A Watch",
    description: "Monthly student-led perspectives on macro and global markets.",
    type: "website",
    url: "/markets",
  },
};

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<PublicationSearchParams>;
}) {
  const parsed = parsePublicationSearchParams(await searchParams);
  const query = { ...parsed, type: undefined, by: undefined };
  const [result, filters] = await Promise.all([
    searchLivePublishedPublications({ ...query, type: "markets", pageSize: 6 }),
    getLivePublicationFilters("markets"),
  ]);

  return (
    <PublicationCollectionPage
      activeType="markets"
      basePath="/markets"
      eyebrow="Markets"
      filters={filters}
      introduction="A student-led reading of the macro narrative, cross-asset signals and market developments that frame decisions in finance and law."
      query={query}
      result={result}
      showAttributionFilter={false}
      title="Context for capital in motion."
    />
  );
}
