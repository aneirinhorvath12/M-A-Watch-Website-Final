import { getPublishedSiteContact } from "@/lib/public-content";

const PUBLIC_KEYS = new Set(["site.contact"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!PUBLIC_KEYS.has(key)) return new Response("Not found", { status: 404 });
  return Response.json(await getPublishedSiteContact(), {
    headers: { "cache-control": "no-store" },
  });
}
