/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    ASSETS: Fetcher;
    EMAIL_WEBHOOK_URL?: string;
    EMAIL_WEBHOOK_TOKEN?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    MALWARE_SCAN_WEBHOOK_URL?: string;
    MALWARE_SCAN_WEBHOOK_TOKEN?: string;
    CLOUDMERSIVE_API_KEY?: string;
    APPLICATION_INTAKE_ENABLED?: string;
    APPROVED_APPLICANT_RETENTION_DAYS?: string;
    APPROVED_APPLICATION_PRIVACY_VERSION?: string;
    PARSER_WEBHOOK_URL?: string;
    PARSER_WEBHOOK_TOKEN?: string;
    ADOBE_PDF_SERVICES_CLIENT_ID?: string;
    ADOBE_PDF_SERVICES_CLIENT_SECRET?: string;
    ADOBE_PDF_SERVICES_REGION?: string;
    PUBLICATION_CONTENT_MODE?: string;
    NEXT_PUBLIC_SITE_URL?: string;
    REQUIRE_PRODUCTION_SERVICES?: string;
    ANALYTICS_ENABLED?: string;
    INITIAL_SUPER_USER_EMAIL?: string;
    MAINTENANCE_TOKEN?: string;
    MAINTENANCE_HEARTBEAT_URL?: string;
    MAINTENANCE_ALERT_WEBHOOK_URL?: string;
    MAINTENANCE_ALERT_WEBHOOK_TOKEN?: string;
  }
}
