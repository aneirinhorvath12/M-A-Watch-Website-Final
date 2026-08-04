import assert from "node:assert/strict";
import test from "node:test";
import {
  missingMaintenanceMonitoringConfiguration,
  notifyMaintenanceCompleted,
  notifyMaintenanceFailed,
} from "../lib/maintenance-monitoring";

const completeMonitoring = {
  MAINTENANCE_HEARTBEAT_URL: "https://heartbeat.example/check-in",
  MAINTENANCE_ALERT_WEBHOOK_URL: "https://alerts.example/maintenance",
  MAINTENANCE_ALERT_WEBHOOK_TOKEN: "alert-secret",
};

test("production monitoring configuration requires HTTPS and an alert token", () => {
  assert.deepEqual(
    missingMaintenanceMonitoringConfiguration(completeMonitoring),
    [],
  );
  assert.deepEqual(
    missingMaintenanceMonitoringConfiguration({
      ...completeMonitoring,
      MAINTENANCE_HEARTBEAT_URL: "http://heartbeat.example/check-in",
      MAINTENANCE_ALERT_WEBHOOK_URL: "https://user:password@alerts.example/hook#secret",
      MAINTENANCE_ALERT_WEBHOOK_TOKEN: "",
    }),
    ["maintenance_heartbeat", "maintenance_failure_notifications"],
  );
});

test("successful maintenance emits a minimal heartbeat only", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init: init ?? {} });
    return new Response(null, { status: 204 });
  };

  await notifyMaintenanceCompleted(
    completeMonitoring,
    { failed: 0, awaitingConfiguration: 0 },
    { startedAt: 1_000, finishedAt: 1_250 },
    fakeFetch,
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://heartbeat.example/check-in");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.redirect, "error");
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), {
    schemaVersion: 1,
    event: "maintenance.completed",
    occurredAt: "1970-01-01T00:00:01.250Z",
    durationMs: 250,
  });
  const headers = new Headers(requests[0].init.headers);
  assert.equal(headers.has("authorization"), false);
});

test("job failures emit aggregate counts without job or applicant data", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init: init ?? {} });
    return new Response(null, { status: 202 });
  };

  await notifyMaintenanceCompleted(
    completeMonitoring,
    { failed: 2.9, awaitingConfiguration: 1 },
    { startedAt: 10_000, finishedAt: 10_600 },
    fakeFetch,
  );

  assert.equal(requests.length, 2);
  const alert = requests.find(({ url }) => url.includes("alerts.example"));
  assert.ok(alert);
  assert.deepEqual(JSON.parse(String(alert.init.body)), {
    schemaVersion: 1,
    event: "maintenance.attention_required",
    occurredAt: "1970-01-01T00:00:10.600Z",
    durationMs: 600,
    failedJobs: 2,
    awaitingConfiguration: 1,
  });
  assert.equal(
    new Headers(alert.init.headers).get("authorization"),
    "Bearer alert-secret",
  );
  assert.doesNotMatch(
    String(alert.init.body),
    /applicant|email|filename|object|private\/|exception|stack/i,
  );
});

test("scheduler failures never send exception content", async () => {
  let request: { url: string; init: RequestInit } | undefined;
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    request = { url: String(input), init: init ?? {} };
    return new Response(null, { status: 200 });
  };

  await notifyMaintenanceFailed(
    completeMonitoring,
    { startedAt: 20_000, finishedAt: 21_000 },
    fakeFetch,
  );

  assert.ok(request);
  assert.deepEqual(JSON.parse(String(request.init.body)), {
    schemaVersion: 1,
    event: "maintenance.failed",
    occurredAt: "1970-01-01T00:00:21.000Z",
    durationMs: 1_000,
  });
});

test("configured insecure monitor URLs fail before any request", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  };

  await assert.rejects(
    notifyMaintenanceCompleted(
      { MAINTENANCE_HEARTBEAT_URL: "http://heartbeat.example/ping" },
      { failed: 0, awaitingConfiguration: 0 },
      { startedAt: 0, finishedAt: 1 },
      fakeFetch,
    ),
    /valid HTTPS URL/,
  );
  assert.equal(calls, 0);
});
