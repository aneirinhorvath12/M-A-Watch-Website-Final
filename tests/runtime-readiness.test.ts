import assert from "node:assert/strict";
import test from "node:test";
import {
  missingProductionServiceConfiguration,
  productionServicesAreRequired,
} from "../lib/runtime-readiness";

const completeRuntime = {
  REQUIRE_PRODUCTION_SERVICES: "true",
  NEXT_PUBLIC_SITE_URL: "https://mawatch.example",
  INITIAL_SUPER_USER_EMAIL: "owner@mawatch.example",
  ANALYTICS_ENABLED: "true",
  MAINTENANCE_SCHEDULER_ENABLED: "true",
  RESEND_API_KEY: "re_secret",
  EMAIL_FROM: "M&A Watch <updates@mawatch.example>",
  MALWARE_SCAN_WEBHOOK_URL: "https://scanner.example/scan",
  MALWARE_SCAN_WEBHOOK_TOKEN: "scanner-secret",
  PARSER_WEBHOOK_URL: "https://parser.example/extract",
  PARSER_WEBHOOK_TOKEN: "parser-secret",
  MAINTENANCE_HEARTBEAT_URL: "https://heartbeat.example/check-in",
  MAINTENANCE_ALERT_WEBHOOK_URL: "https://alerts.example/maintenance",
  MAINTENANCE_ALERT_WEBHOOK_TOKEN: "alert-secret",
};

test("complete production service configuration passes readiness", () => {
  assert.equal(productionServicesAreRequired(completeRuntime), true);
  assert.deepEqual(missingProductionServiceConfiguration(completeRuntime), []);
});

test("production readiness identifies missing capabilities without values", () => {
  assert.deepEqual(missingProductionServiceConfiguration({}), [
    "canonical_site_url",
    "initial_super_user",
    "first_party_analytics",
    "maintenance_scheduler",
    "transactional_email",
    "malware_scanner",
    "pdf_parser",
    "maintenance_heartbeat",
    "maintenance_failure_notifications",
  ]);
});

test("production adapter endpoints must use HTTPS and include credentials", () => {
  const missing = missingProductionServiceConfiguration({
    ...completeRuntime,
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    MALWARE_SCAN_WEBHOOK_URL: "http://scanner.example/scan",
    PARSER_WEBHOOK_TOKEN: "",
    MAINTENANCE_HEARTBEAT_URL: "http://heartbeat.example/ping",
    MAINTENANCE_ALERT_WEBHOOK_TOKEN: "",
    ANALYTICS_ENABLED: "false",
    MAINTENANCE_SCHEDULER_ENABLED: "false",
  });

  assert.deepEqual(missing, [
    "canonical_site_url",
    "first_party_analytics",
    "maintenance_scheduler",
    "malware_scanner",
    "pdf_parser",
    "maintenance_heartbeat",
    "maintenance_failure_notifications",
  ]);
});

test("transactional email webhook readiness rejects an insecure endpoint", () => {
  const missing = missingProductionServiceConfiguration({
    ...completeRuntime,
    RESEND_API_KEY: undefined,
    EMAIL_FROM: undefined,
    EMAIL_WEBHOOK_URL: "http://email.example/send",
    EMAIL_WEBHOOK_TOKEN: "email-secret",
  });

  assert.ok(missing.includes("transactional_email"));
});

test("readiness enforcement is explicit", () => {
  assert.equal(productionServicesAreRequired({}), false);
  assert.equal(
    productionServicesAreRequired({ REQUIRE_PRODUCTION_SERVICES: " TRUE " }),
    true,
  );
});

test("direct Adobe credentials satisfy parser readiness with an explicit region", () => {
  const directAdobe = {
    ...completeRuntime,
    PARSER_WEBHOOK_URL: undefined,
    PARSER_WEBHOOK_TOKEN: undefined,
    ADOBE_PDF_SERVICES_CLIENT_ID: "adobe-client-id",
    ADOBE_PDF_SERVICES_CLIENT_SECRET: "adobe-client-secret",
    ADOBE_PDF_SERVICES_REGION: "eu",
  };
  assert.deepEqual(missingProductionServiceConfiguration(directAdobe), []);
  assert.deepEqual(
    missingProductionServiceConfiguration({
      ...directAdobe,
      PARSER_WEBHOOK_URL: "https://stale-parser.example/extract",
      PARSER_WEBHOOK_TOKEN: undefined,
    }),
    [],
  );
  assert.ok(
    missingProductionServiceConfiguration({
      ...directAdobe,
      ADOBE_PDF_SERVICES_REGION: undefined,
    }).includes("pdf_parser"),
  );
});
