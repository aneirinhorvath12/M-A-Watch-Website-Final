# M&A Watch website

The public publishing and private administration website for M&A Watch, a
student-led finance, law and markets society. The repository contains the
responsive public site, structured report and Markets PDF experiences,
application intake, role-gated administration, durable background work and
Cloudflare deployment configuration.

Placeholder editorial content and representative reports are included so the
workflows can be exercised before the team supplies launch copy. Production
email, malware scanning, PDF extraction, analytics, monitoring and backups are
not configured by this repository; they remain explicit launch tasks.

## Technology

- Next-compatible React application built with vinext
- Cloudflare Worker runtime through OpenAI Sites
- Cloudflare D1 for structured records and the durable job outbox
- Cloudflare R2 for private CVs and source PDFs
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
| `INITIAL_SUPER_USER_EMAIL` | The only identity allowed to create the first Super User when the user table is empty | Required before first admin sign-in |
| `MAINTENANCE_TOKEN` | Bearer secret for an external scheduler calling `POST /api/maintenance` | Required only for the HTTP scheduler path |
| `EMAIL_WEBHOOK_URL`, `EMAIL_WEBHOOK_TOKEN` | Transactional email delivery adapter | Provider not configured |
| `MALWARE_SCAN_WEBHOOK_URL`, `MALWARE_SCAN_WEBHOOK_TOKEN` | PDF malware-scanning adapter | Provider not configured |
| `PARSER_WEBHOOK_URL`, `PARSER_WEBHOOK_TOKEN` | Strategic/Legal PDF extraction adapter | Provider not configured |

The first-admin bootstrap fails closed when `INITIAL_SUPER_USER_EMAIL` is absent
or does not match the signed-in identity. Set it before anyone visits the admin
area in a new environment.

## Operations

- `GET` or `HEAD /api/health` checks D1 and private R2 readiness without exposing
  record or provider details.
- The Worker exports a scheduled handler for due publications and queued jobs.
  A recurring production trigger still has to be provisioned by the hosting
  owner.
- An external scheduler can instead call `POST /api/maintenance` with
  `Authorization: Bearer <MAINTENANCE_TOKEN>`.
- Background jobs use atomic claims, a five-minute lease, bounded retries and a
  stable provider `Idempotency-Key`. Provider adapters must honour that key.

See [docs/operations.md](docs/operations.md) for integration contracts,
monitoring and recovery steps, and [docs/architecture.md](docs/architecture.md)
for the application boundaries. The product acceptance register is in
[docs/product-acceptance-checklist.md](docs/product-acceptance-checklist.md).
