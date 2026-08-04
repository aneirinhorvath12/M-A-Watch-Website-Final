import { ensureDatabase } from "@/db/bootstrap";
import { apiError, authorizeAdminRequest } from "@/lib/admin-api";
import { writeAudit } from "@/lib/audit";
import { database, privateFiles } from "@/lib/platform";

export const dynamic = "force-dynamic";

function filename(slug: string): string {
  return `${slug.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 110) || "report"}.pdf`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const { id } = await params;
  const publication = await database()
    .prepare("SELECT id, slug, source_pdf_key FROM publications WHERE id = ? LIMIT 1")
    .bind(id)
    .first<{ id: string; slug: string; source_pdf_key: string | null }>();
  if (!publication?.source_pdf_key) return apiError("Publication source not found.", 404);

  const object = await privateFiles().get(publication.source_pdf_key);
  if (!object) return apiError("Publication source not found in private storage.", 404);
  if (object.customMetadata?.scanStatus !== "clean") {
    return apiError("The source remains quarantined until its external malware scan reports clean.", 423);
  }
  await writeAudit({
    actorId: auth.actor.id,
    action: "publication.source_viewed",
    entityType: "publication",
    entityId: id,
  });
  return new Response(object.body, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `inline; filename="${filename(publication.slug)}"`,
      "Content-Length": String(object.size),
      "Content-Security-Policy":
        "base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'none'",
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
