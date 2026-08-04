import { env } from "cloudflare:workers";
import { runMaintenance, type JobRunSummary } from "@/lib/job-runner";
import { hasValidMaintenanceToken } from "@/lib/maintenance-auth";
import {
  notifyMaintenanceCompleted,
  notifyMaintenanceFailed,
  type MaintenanceMonitoringEnv,
} from "@/lib/maintenance-monitoring";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "cache-control": "no-store, max-age=0",
  "content-type": "application/json",
};

type MaintenanceRuntime = MaintenanceMonitoringEnv & {
  MAINTENANCE_TOKEN?: string;
};

export async function POST(request: Request) {
  const runtime = env as unknown as MaintenanceRuntime;
  const token = runtime.MAINTENANCE_TOKEN;
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

  const startedAt = Date.now();
  let summary: JobRunSummary;
  try {
    summary = await runMaintenance();
  } catch {
    console.error("Maintenance run failed");
    try {
      await notifyMaintenanceFailed(runtime, {
        startedAt,
        finishedAt: Date.now(),
      });
    } catch {
      console.error("Maintenance failure notification could not be delivered");
    }
    return Response.json(
      { ok: false, error: "Maintenance could not complete." },
      { status: 500, headers: responseHeaders },
    );
  }

  try {
    await notifyMaintenanceCompleted(runtime, summary, {
      startedAt,
      finishedAt: Date.now(),
    });
  } catch {
    console.error("Maintenance heartbeat or alert could not be delivered");
    return Response.json(
      { ok: false, error: "Maintenance monitoring could not be notified." },
      { status: 502, headers: responseHeaders },
    );
  }

  return Response.json(
    { ok: true, summary },
    { status: 200, headers: responseHeaders },
  );
}
