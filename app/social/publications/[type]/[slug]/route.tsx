import { ImageResponse } from "next/og";
import { getLivePublicPublication, type PublicationType } from "@/lib/publications";
import { publicationTypeSocialLabel } from "@/lib/seo";

export const dynamic = "force-dynamic";

const PUBLICATION_TYPES = new Set<PublicationType>(["strategic", "legal", "markets"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; type: string }> },
) {
  const { slug, type } = await params;
  if (!PUBLICATION_TYPES.has(type as PublicationType)) {
    return new Response("Not found", { status: 404 });
  }

  const publication = await getLivePublicPublication(type as PublicationType, slug);
  if (!publication) return new Response("Not found", { status: 404 });

  const typeLabel = publicationTypeSocialLabel(publication.type);
  const attribution = publication.authors.length
    ? publication.authors.join(", ")
    : publication.chapter ?? "M&A Watch Research";
  const title = publication.title.length > 132
    ? `${publication.title.slice(0, 129).trimEnd()}…`
    : publication.title;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          overflow: "hidden",
          padding: "66px 76px",
          background: "#2c4151",
          color: "#ffffff",
          fontFamily: "Arial, Helvetica, sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "520px",
            height: "520px",
            right: "-150px",
            top: "-235px",
            border: "2px solid rgba(154, 197, 232, 0.32)",
            borderRadius: "999px",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "360px",
            height: "360px",
            right: "-70px",
            top: "-155px",
            border: "2px solid rgba(154, 197, 232, 0.32)",
            borderRadius: "999px",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: "30px", fontWeight: 700 }}>
            <span style={{ color: "#9ac5e8", marginRight: "12px" }}>M&amp;A</span> Watch
          </div>
          <div style={{ color: "#9ac5e8", fontSize: "22px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {typeLabel}
          </div>
        </div>
        <div style={{ display: "flex", maxWidth: "980px", flexDirection: "column" }}>
          <div style={{ width: "86px", height: "8px", marginBottom: "30px", background: "#347dcf" }} />
          <div style={{ fontSize: title.length > 82 ? "54px" : "66px", fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.03 }}>
            {title}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderTop: "1px solid rgba(255, 255, 255, 0.28)", paddingTop: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#9ac5e8", fontSize: "18px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>Analysis by</span>
            <span style={{ marginTop: "8px", fontSize: "24px" }}>{attribution}</span>
          </div>
          <span style={{ fontSize: "22px" }}>{publication.publicationDate}</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, must-revalidate",
      },
    },
  );
}
