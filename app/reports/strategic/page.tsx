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
  title: "Strategic Deal Reports | M&A Watch",
  description:
    "Read student-led analysis of transaction rationale, valuation, execution and value creation.",
  alternates: { canonical: "/reports/strategic" },
  openGraph: {
    title: "Strategic Deal Reports | M&A Watch",
    description: "Rigorous student perspectives on the strategy behind notable transactions.",
    type: "website",
    url: "/reports/strategic",
  },
};

export default async function StrategicReportsPage({
  searchParams,
}: {
  searchParams: Promise<PublicationSearchParams>;
}) {
  const parsed = parsePublicationSearchParams(await searchParams);
  const query = { ...parsed, type: undefined };
  const [result, filters] = await Promise.all([
    searchLivePublishedPublications({ ...query, type: "strategic", pageSize: 6 }),
    getLivePublicationFilters("strategic"),
  ]);

  return (
    <PublicationCollectionPage
      activeType="strategic"
      basePath="/reports/strategic"
      eyebrow="Strategic Deal Reports"
      filters={filters}
      introduction="We go beyond the headline to examine why a deal makes sense, how it is structured and what must happen for the investment thesis to hold."
      query={query}
      result={result}
      title="The thinking behind the transaction."
    />
  );
}
