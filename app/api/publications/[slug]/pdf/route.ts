import { ensureDatabase } from "@/db/bootstrap";
import { database, privateFiles } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  await ensureDatabase();
  const { slug } = await params;
  const publication = await database()
    .prepare(
      `SELECT title, source_pdf_key FROM publications
       WHERE slug = ? AND status = 'published' LIMIT 1`,
    )
    .bind(slug)
    .first<{ title: string; source_pdf_key: string | null }>();
  if (!publication?.source_pdf_key) return new Response("Not found", { status: 404 });

  const object = await privateFiles().get(publication.source_pdf_key);
  if (!object || object.customMetadata?.scanStatus !== "clean") {
    return new Response("Not found", { status: 404 });
  }
  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = `${publication.title.replace(/[^a-zA-Z0-9 ._-]/g, "").trim() || "report"}.pdf`;
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", "application/pdf");
  headers.set("content-length", String(object.size));
  headers.set("content-disposition", `${download ? "attachment" : "inline"}; filename="${filename}"`);
  headers.set("cache-control", "public, max-age=3600, must-revalidate");
  headers.set(
    "content-security-policy",
    "base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'none'",
  );
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
