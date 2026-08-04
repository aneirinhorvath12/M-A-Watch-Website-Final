import { env } from "cloudflare:workers";
import { runMaintenance } from "@/lib/job-runner";
import { hasValidMaintenanceToken } from "@/lib/maintenance-auth";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "cache-control": "no-store, max-age=0",
  "content-type": "application/json",
};

export async function POST(request: Request) {
  const token = (env as unknown as { MAINTENANCE_TOKEN?: string })
    .MAINTENANCE_TOKEN;
  if (!token?.trim()) {
    return Response.json(
      { ok: false, error: "Maintenance is not configured." },
      { status: 503, headers: responseHeaders },
    );
  }
  if (!(await hasValidMaintenanceToken(request, token))) {
    return Response.json(
      { ok: false, error: "Unauthorized." },
      {
        status: 401,
        headers: { ...responseHeaders, "www-authenticate": "Bearer" },
      },
    );
  }

  try {
    const summary = await runMaintenance();
    return Response.json(
      { ok: true, summary },
      { status: 200, headers: responseHeaders },
    );
  } catch (error) {
    console.error("Maintenance run failed", error);
    return Response.json(
      { ok: false, error: "Maintenance could not complete." },
      { status: 500, headers: responseHeaders },
    );
  }
}
