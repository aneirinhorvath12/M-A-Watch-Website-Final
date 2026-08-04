/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    ASSETS: Fetcher;
    EMAIL_WEBHOOK_URL?: string;
    EMAIL_WEBHOOK_TOKEN?: string;
    MALWARE_SCAN_WEBHOOK_URL?: string;
    MALWARE_SCAN_WEBHOOK_TOKEN?: string;
    PARSER_WEBHOOK_URL?: string;
    PARSER_WEBHOOK_TOKEN?: string;
    INITIAL_SUPER_USER_EMAIL?: string;
    MAINTENANCE_TOKEN?: string;
  }
}
