import { apiError, authorizeAdminRequest } from "@/lib/admin-api";
import { listApplicants } from "@/lib/admin-data";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const ids = url.searchParams.get("ids")?.split(",").map((value) => value.trim()).filter(Boolean);
  if (ids && ids.length > 100) return apiError("Select at most 100 specific applicants, or export using filters.", 422);
  const filters = {
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    division: url.searchParams.get("division") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    ids,
    limit: 10_001,
  };
  const applicants = await listApplicants(filters);
  if (applicants.length > 10_000) {
    return apiError("More than 10,000 applicants match. Narrow the date range or other filters and export again. No partial CSV has been generated.", 422);
  }
  const header = ["Application ID", "Name", "University", "Email", "Division", "Status", "Submitted at", "Privacy version", "Possible duplicate"];
  const rows = applicants.map((item) => [
    item.id,
    item.name,
    item.university,
    item.email,
    item.division,
    item.status,
    new Date(item.submitted_at).toISOString(),
    item.privacy_policy_version,
    item.duplicate_count > 1 ? "Yes" : "No",
  ]);
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  await writeAudit({
    actorId: auth.actor.id,
    action: "applicant.exported",
    entityType: "applicant_export",
    metadata: { recordCount: applicants.length, filtered: Boolean(filters.q || filters.status || filters.division || filters.from || filters.to || ids?.length) },
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mna-watch-applicants-${new Date().toISOString().slice(0, 10)}.csv"`,
      "X-Export-Record-Count": String(applicants.length),
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Download-Options": "noopen",
    },
  });
}
