import { validatedIntegrationUrl } from "@/lib/integration-security";

const MONITOR_REQUEST_TIMEOUT_MS = 5_000;

export type MaintenanceMonitoringEnv = {
  MAINTENANCE_HEARTBEAT_URL?: string;
  MAINTENANCE_ALERT_WEBHOOK_URL?: string;
  MAINTENANCE_ALERT_WEBHOOK_TOKEN?: string;
};

export type MaintenanceOutcomeSummary = {
  failed: number;
  awaitingConfiguration: number;
};

type MaintenanceTiming = {
  startedAt: number;
  finishedAt?: number;
};

type MaintenanceEvent =
  | {
      schemaVersion: 1;
      event: "maintenance.completed";
      occurredAt: string;
      durationMs: number;
    }
  | {
      schemaVersion: 1;
      event: "maintenance.attention_required";
      occurredAt: string;
      durationMs: number;
      failedJobs: number;
      awaitingConfiguration: number;
    }
  | {
      schemaVersion: 1;
      event: "maintenance.failed";
      occurredAt: string;
      durationMs: number;
    };

type FetchImplementation = typeof fetch;

/**
 * Return coarse configuration labels only. Endpoint and token values may be
 * secrets and must never be returned by readiness responses or logs.
 */
export function missingMaintenanceMonitoringConfiguration(
  runtime: MaintenanceMonitoringEnv,
): string[] {
  const missing: string[] = [];
  if (!strictHttpsUrl(runtime.MAINTENANCE_HEARTBEAT_URL)) {
    missing.push("maintenance_heartbeat");
  }
  if (
    !strictHttpsUrl(runtime.MAINTENANCE_ALERT_WEBHOOK_URL) ||
    !runtime.MAINTENANCE_ALERT_WEBHOOK_TOKEN?.trim()
  ) {
    missing.push("maintenance_failure_notifications");
  }
  return missing;
}

/**
 * Signal that the scheduler ran. A second coarse alert is emitted when the
 * maintenance cycle completed but one or more jobs still need attention.
 */
export async function notifyMaintenanceCompleted(
  runtime: MaintenanceMonitoringEnv,
  summary: MaintenanceOutcomeSummary,
  timing: MaintenanceTiming,
  fetchImplementation: FetchImplementation = fetch,
): Promise<void> {
  const heartbeat = optionalConfiguredUrl(
    runtime.MAINTENANCE_HEARTBEAT_URL,
    "maintenance heartbeat",
  );
  const alert = optionalConfiguredUrl(
    runtime.MAINTENANCE_ALERT_WEBHOOK_URL,
    "maintenance alert webhook",
  );
  const token = runtime.MAINTENANCE_ALERT_WEBHOOK_TOKEN?.trim();
  const finishedAt = timing.finishedAt ?? Date.now();
  const common = eventTiming(timing.startedAt, finishedAt);
  const deliveries: Promise<void>[] = [];

  if (heartbeat) {
    deliveries.push(
      deliverMaintenanceEvent(
        heartbeat,
        {
          schemaVersion: 1,
          event: "maintenance.completed",
          ...common,
        },
        undefined,
        fetchImplementation,
      ),
    );
  }

  const failedJobs = boundedCount(summary.failed);
  const awaitingConfiguration = boundedCount(summary.awaitingConfiguration);
  if (alert && (failedJobs > 0 || awaitingConfiguration > 0)) {
    if (!token) {
      throw new Error("The maintenance alert webhook token is not configured.");
    }
    deliveries.push(
      deliverMaintenanceEvent(
        alert,
        {
          schemaVersion: 1,
          event: "maintenance.attention_required",
          ...common,
          failedJobs,
          awaitingConfiguration,
        },
        token,
        fetchImplementation,
      ),
    );
  }

  await Promise.all(deliveries);
}

/**
 * Signal a scheduler-level failure. Deliberately omit exception messages,
 * stack traces, record IDs and provider details from the external payload.
 */
export async function notifyMaintenanceFailed(
  runtime: MaintenanceMonitoringEnv,
  timing: MaintenanceTiming,
  fetchImplementation: FetchImplementation = fetch,
): Promise<void> {
  const alert = optionalConfiguredUrl(
    runtime.MAINTENANCE_ALERT_WEBHOOK_URL,
    "maintenance alert webhook",
  );
  if (!alert) return;
  const token = runtime.MAINTENANCE_ALERT_WEBHOOK_TOKEN?.trim();
  if (!token) {
    throw new Error("The maintenance alert webhook token is not configured.");
  }
  const finishedAt = timing.finishedAt ?? Date.now();
  await deliverMaintenanceEvent(
    alert,
    {
      schemaVersion: 1,
      event: "maintenance.failed",
      ...eventTiming(timing.startedAt, finishedAt),
    },
    token,
    fetchImplementation,
  );
}

function strictHttpsUrl(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  const validated = validatedIntegrationUrl(candidate);
  if (!validated) return null;
  const url = new URL(validated);
  if (url.username || url.password || url.hash) return null;
  return url.toString();
}

function optionalConfiguredUrl(
  value: string | undefined,
  label: string,
): string | null {
  if (!value?.trim()) return null;
  const url = strictHttpsUrl(value);
  if (!url) throw new Error(`The ${label} must be a valid HTTPS URL.`);
  return url;
}

function eventTiming(
  startedAt: number,
  finishedAt: number,
): Pick<MaintenanceEvent, "occurredAt" | "durationMs"> {
  const safeFinishedAt = Number.isFinite(finishedAt) ? finishedAt : Date.now();
  const safeStartedAt = Number.isFinite(startedAt) ? startedAt : safeFinishedAt;
  return {
    occurredAt: new Date(safeFinishedAt).toISOString(),
    durationMs: Math.max(0, Math.round(safeFinishedAt - safeStartedAt)),
  };
}

function boundedCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

async function deliverMaintenanceEvent(
  endpoint: string,
  event: MaintenanceEvent,
  token: string | undefined,
  fetchImplementation: FetchImplementation,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MONITOR_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImplementation(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json",
        "x-ma-watch-event": event.event,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`The maintenance monitor returned HTTP ${response.status}.`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
