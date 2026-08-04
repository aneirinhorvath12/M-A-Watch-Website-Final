# M&A Watch website

The public publishing and private administration website for M&A Watch, a
student-led finance, law and markets society. The repository contains the
responsive public site, structured report and Markets PDF experiences,
application intake, role-gated administration, durable background work and
Cloudflare deployment configuration.

Placeholder editorial content and representative reports are included so the
workflows can be exercised before the team supplies launch copy. Production
email, malware scanning, PDF extraction, monitoring and backups are not
configured by this repository; they remain explicit launch tasks. Cookie-free
first-party aggregate analytics is implemented but remains disabled until it is
explicitly enabled in the hosted environment.

## Technology

- Next-compatible React application built with vinext
- Cloudflare Worker runtime through OpenAI Sites
- Cloudflare D1 for structured records and the durable job outbox
- Cloudflare R2 for private CVs, source PDFs and managed editorial images
- TypeScript, Drizzle migrations, ESLint and Node's test runner

Logical `DB` and `FILES` bindings are declared in `.openai/hosting.json`. Do not
add real Cloudflare resource identifiers or credentials to the repository.

## Local setup

Use Node.js 22.13 or newer.

```bash
cp .env.example .env.local
npm ci
npm run db:migrate:local
npm run dev
```

Local D1 and R2 state is created under ignored `.wrangler/` files. Checked-in
Drizzle migrations are the sole schema authority in every environment. Request
handling performs only a lightweight readiness check and idempotent settings
seed; it never creates or alters tables. Run `npm run db:migrate:local` after a
fresh checkout and whenever new migrations are pulled.

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:rendered
```

`npm run verify` runs that complete sequence. The rendered tests expect a fresh
`dist/` from `npm run build`.

## Required runtime decisions

Copy `.env.example` for local names only. Hosted values must be set through the
Sites environment controls and must never be committed.

| Variable | Purpose | Launch status |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical public URL used by metadata and sitemap output | Set for each environment |
| `REQUIRE_PRODUCTION_SERVICES` | Makes health checks fail closed when launch integrations are absent | Set `true` only for accepted staging/production |
| `ANALYTICS_ENABLED` | Enables cookie-free first-party daily aggregate counters; any value other than exact `true` disables collection | Explicit approval required before production enforcement |
| `INITIAL_SUPER_USER_EMAIL` | The only identity allowed to create the first Super User when the user table is empty | Required before first admin sign-in |
| `MAINTENANCE_TOKEN` | Bearer secret for an external scheduler calling `POST /api/maintenance` | Required only for the HTTP scheduler path |
| `MAINTENANCE_HEARTBEAT_URL` | HTTPS check-in destination for completed scheduled maintenance | Monitoring destination not configured |
| `MAINTENANCE_ALERT_WEBHOOK_URL`, `MAINTENANCE_ALERT_WEBHOOK_TOKEN` | Authenticated HTTPS incident destination for scheduler and aggregate job failures | Monitoring destination not configured |
| `RESEND_API_KEY`, `EMAIL_FROM` | Recommended direct transactional email delivery | Provider not configured |
| `EMAIL_WEBHOOK_URL`, `EMAIL_WEBHOOK_TOKEN` | Optional custom transactional email adapter; a complete valid pair takes precedence over Resend | Provider not configured |
| `CLOUDMERSIVE_API_KEY` | Recommended direct advanced PDF malware scanning | Provider not configured |
| `MALWARE_SCAN_WEBHOOK_URL`, `MALWARE_SCAN_WEBHOOK_TOKEN` | PDF malware-scanning adapter | Provider not configured |
| `ADOBE_PDF_SERVICES_CLIENT_ID`, `ADOBE_PDF_SERVICES_CLIENT_SECRET`, `ADOBE_PDF_SERVICES_REGION` | Recommended direct Strategic/Legal extraction; choose `eu` for UK/EU processing | Provider not configured |
| `PARSER_WEBHOOK_URL`, `PARSER_WEBHOOK_TOKEN` | Optional custom extraction adapter; a complete secure pair takes precedence over Adobe | Provider not configured |

The first-admin bootstrap fails closed when `INITIAL_SUPER_USER_EMAIL` is absent
or does not match the signed-in identity. Set it before anyone visits the admin
area in a new environment.

When `REQUIRE_PRODUCTION_SERVICES=true`, `/api/health` also requires a canonical
HTTPS URL, an initial Super User, explicitly enabled first-party analytics,
transactional email, malware scanning and PDF parsing, plus maintenance heartbeat
and failure-alert destinations. It reports
only a coarse unavailable state publicly; missing setting labels are written to
protected runtime logs.

Application intake also requires the canonical HTTPS URL because administrator
notifications contain an authenticated absolute link to the applicant record.

Analytics uses only the same-origin `POST /api/analytics` endpoint and the
`analytics_daily` D1 table. It stores daily low-cardinality counters, not event
rows: no cookies, third-party scripts, IP addresses, user agents, referrers,
raw URLs/searches, visitor identifiers, applicant identifiers or form values.
Maintenance deletes counters older than 400 days. Administrators can review the
aggregate report at `/admin/analytics`.

## Operations

- `GET` or `HEAD /api/health` checks D1 and private R2 readiness without exposing
  record or provider details.
- The Worker exports a scheduled handler for due publications and queued jobs.
  A recurring production trigger still has to be provisioned by the hosting
  owner.
- An external scheduler can instead call `POST /api/maintenance` with
  `Authorization: Bearer <MAINTENANCE_TOKEN>`.
- Background jobs use atomic claims, a five-minute lease, per-claim fencing
  tokens, bounded retries and a stable provider `Idempotency-Key`. Provider
  adapters must honour that key.
- `npm run verify:release` performs non-mutating HTTPS acceptance checks when
  `SMOKE_BASE_URL` points to a deployed candidate.

See [docs/operations.md](docs/operations.md) for integration contracts,
monitoring and recovery steps, and [docs/architecture.md](docs/architecture.md)
for the application boundaries. The product acceptance register is in
[docs/product-acceptance-checklist.md](docs/product-acceptance-checklist.md).
