import { getPublishedContent } from "@/lib/public-content";

const PUBLIC_KEYS = new Set(["site.contact"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!PUBLIC_KEYS.has(key)) return new Response("Not found", { status: 404 });
  const content = await getPublishedContent(key);
  return Response.json(content ?? {});
}
