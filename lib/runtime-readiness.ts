import { resolveEmailProvider } from "@/lib/email-provider";
import { validatedIntegrationUrl } from "@/lib/integration-security";
import {
  missingMaintenanceMonitoringConfiguration,
  type MaintenanceMonitoringEnv,
} from "@/lib/maintenance-monitoring";
import { resolveMalwareProvider } from "@/lib/malware-provider";
import { analyticsEnabled } from "@/lib/analytics-policy";
import {
  resolveParserProvider,
  type ParserProviderEnv,
} from "@/lib/parser/provider";

export type ProductionReadinessEnv = MaintenanceMonitoringEnv & ParserProviderEnv & {
  REQUIRE_PRODUCTION_SERVICES?: string;
  ANALYTICS_ENABLED?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  INITIAL_SUPER_USER_EMAIL?: string;
  EMAIL_WEBHOOK_URL?: string;
  EMAIL_WEBHOOK_TOKEN?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  MALWARE_SCAN_WEBHOOK_URL?: string;
  MALWARE_SCAN_WEBHOOK_TOKEN?: string;
  CLOUDMERSIVE_API_KEY?: string;
};

export function productionServicesAreRequired(
  runtime: ProductionReadinessEnv,
): boolean {
  return runtime.REQUIRE_PRODUCTION_SERVICES?.trim().toLowerCase() === "true";
}

/** Return configuration labels only; never return secret values. */
export function missingProductionServiceConfiguration(
  runtime: ProductionReadinessEnv,
): string[] {
  const missing: string[] = [];
  if (!isCanonicalProductionUrl(runtime.NEXT_PUBLIC_SITE_URL)) {
    missing.push("canonical_site_url");
  }
  if (!looksLikeEmail(runtime.INITIAL_SUPER_USER_EMAIL)) {
    missing.push("initial_super_user");
  }
  if (!analyticsEnabled(runtime.ANALYTICS_ENABLED)) {
    missing.push("first_party_analytics");
  }

  const email = resolveEmailProvider(runtime);
  if (!email?.token || !validatedIntegrationUrl(email.endpoint)) {
    missing.push("transactional_email");
  }

  const malware = resolveMalwareProvider(runtime);
  if (
    !malware ||
    (malware.kind === "webhook" &&
      (!malware.bearerToken || !validatedIntegrationUrl(malware.endpoint)))
  ) {
    missing.push("malware_scanner");
  }
  if (!resolveParserProvider(runtime)) {
    missing.push("pdf_parser");
  }
  missing.push(...missingMaintenanceMonitoringConfiguration(runtime));
  return missing;
}

function isCanonicalProductionUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !isLoopback(url.hostname);
  } catch {
    return false;
  }
}

function looksLikeEmail(value: string | undefined): boolean {
  const email = value?.trim() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
