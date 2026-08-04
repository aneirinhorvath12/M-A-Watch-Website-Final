# M&A Watch operations runbook

This runbook describes the hooks supplied by the codebase. It does not mean an
email, scanner, parser, monitoring or backup provider has been provisioned.

## Environment setup

1. Provision Sites-managed D1 and R2 resources for the logical `DB` and `FILES`
   bindings in `.openai/hosting.json`.
   Apply every checked-in migration under `drizzle/` before routing traffic to
   a new version. Sites deployment packages these migrations; confirm the
   deployment reports them applied. The request path deliberately does not run
   DDL or repair a partially migrated schema.
2. Set `NEXT_PUBLIC_SITE_URL` to the environment's canonical HTTPS URL.
3. Set `INITIAL_SUPER_USER_EMAIL` before the first admin sign-in. The bootstrap
   deliberately refuses every other identity and refuses to run when this value
   is absent.
4. Generate a high-entropy `MAINTENANCE_TOKEN` if an external scheduler will use
   the protected HTTP hook. Store it only in the hosted secret store.
5. Review the analytics disclosure and 400-day aggregate retention policy, then
   set `ANALYTICS_ENABLED=true`. Every other value keeps collection disabled.
6. Configure the three provider adapters and the two maintenance-monitoring
   destinations below, then verify them in staging.
7. After those checks pass, set `REQUIRE_PRODUCTION_SERVICES=true`. This turns
   missing canonical URL, initial administrator, email, scanning, parsing or
   maintenance-monitoring configuration, or disabled analytics into a readiness
   failure instead of a silently degraded site.

`.env.example` lists the complete local variable names. Never copy real tokens
into that committed file.

## Maintenance trigger

The Worker exports a `scheduled` handler. Provision a recurring trigger with the
hosting owner; a one-minute or five-minute cadence is suitable for scheduled
publishing, depending on the editorial precision agreed for launch. Cloudflare
Cron expressions run in UTC and trigger changes can take up to 15 minutes to
propagate. Keep the protected HTTP hook below as an independent fallback rather
than configuring both paths to run routinely.

Where a platform trigger is unavailable, call:

```text
POST /api/maintenance
Authorization: Bearer <MAINTENANCE_TOKEN>
```

The endpoint fails closed with `503` when no token is configured and `401` for a
missing or incorrect token. A successful response contains counts only; it never
contains recipients, applicant data, object keys or provider tokens.

The runner safely catches up all due Scheduled publications after an outage. It
also reclaims jobs left Running for more than five minutes, uses bounded
exponential backoff, and stops retrying ordinary failures after five attempts.
Failed and waiting jobs are retained in D1 and surfaced in the admin dashboard.
The same maintenance cycle removes aggregate analytics rows older than 400 days
and expired public rate-limit buckets.

## First-party aggregate analytics

Collection is fail-closed: `ANALYTICS_ENABLED` must be exactly `true`. The
browser sends only allowlisted event names and bounded category values to the
same-origin `POST /api/analytics` route. The route rejects missing or foreign
origins, unknown fields, oversized bodies and unapproved values, and applies a
global public write limit that uses no visitor identifier.

D1 stores one incrementing daily counter per event/category in
`analytics_daily`. It does not store per-visit rows, cookies, IP addresses or IP
hashes, user agents, referrers, raw paths, slugs or search text, visitor or
applicant identifiers, CV metadata, or application field values. The client
loads no third-party analytics script. Administrators can view only aggregate
7, 30, 90 or 365-day reports at `/admin/analytics`.

The scheduled or protected HTTP maintenance run deletes rows older than the
fixed 400-day retention boundary. Before enabling collection, approve the
privacy notice and verify three cases in staging: disabled requests cause no D1
write; foreign-origin or non-whitelisted payloads are rejected; and the admin
report is unavailable to anonymous visitors but available to an active Admin.

### Scheduler heartbeat and failure alerts

Set `MAINTENANCE_HEARTBEAT_URL` to a monitor check-in endpoint and
`MAINTENANCE_ALERT_WEBHOOK_URL` plus `MAINTENANCE_ALERT_WEBHOOK_TOKEN` to an
owned incident webhook. Store all three in the hosted secret store: heartbeat
URLs commonly embed a credential in their path. Both endpoints must be HTTPS;
credentials or fragments in the URL are rejected, redirects are not followed,
and delivery has a five-second timeout.

The scheduled Worker sends:

- `maintenance.completed` to the heartbeat after every completed cycle;
- `maintenance.attention_required` to the alert webhook when the cycle finishes
  with failed jobs or work waiting on missing provider configuration; and
- `maintenance.failed` when the maintenance runner itself throws.

External JSON contains only the event name, schema version, timestamp, elapsed
milliseconds and, for attention events, aggregate failed/waiting counts. It
never includes job IDs, applicant or publication IDs, email addresses, object
keys, filenames, exception messages, stack traces or provider responses. The
alert token is sent only as a Bearer header. A failed monitor delivery or failed
maintenance run leaves the Cron invocation failed for platform observability;
the alert monitor should also notify on a missing heartbeat.

The same notifications apply when an external scheduler calls the protected
`POST /api/maintenance` fallback. It should also treat any non-2xx HTTP status
as a failed check-in. If maintenance succeeds but monitor delivery fails, the
endpoint returns `502`; rerunning is safe because publication transitions,
job claims and external provider requests are idempotent.

## Provider contracts

Every request includes:

```text
Authorization: Bearer <provider token>    # when configured
Idempotency-Key: ma-watch:<type>:<job-id>
X-MA-Watch-Job-Id: <job-id>
X-MA-Watch-Job-Type: <type>
```

Provider URLs must use HTTPS because scanner/parser requests contain private
documents and adapter requests may contain bearer credentials. Plain HTTP is
accepted only for an explicit loopback address while running a development
build.

The selected providers must retain and honour `Idempotency-Key`; otherwise a
network failure after provider acceptance can still duplicate an external side
effect.

### Email adapter

The recommended hosted configuration uses Resend directly. Set
`RESEND_API_KEY` as a secret and `EMAIL_FROM` to a sender on a verified domain,
for example `M&A Watch <updates@example.org>`. The worker calls Resend's HTTPS
API with the job's stable idempotency key. If `EMAIL_WEBHOOK_URL` is also set,
the custom webhook takes precedence so an alternative provider can be used
without changing application code.

`EMAIL_WEBHOOK_URL` receives JSON with `to`, `subject`, `text`, `template` and
non-sensitive template data. It must return a 2xx response only after accepting
the idempotent delivery. CV bytes and private object keys are never included.

### Malware scanner

The recommended direct option is Cloudmersive Advanced Virus Scan. Set
`CLOUDMERSIVE_API_KEY` as a secret; the worker submits each quarantined PDF as
multipart data, restricts the accepted type to PDF and requires an explicit
`CleanResult=true`. The custom webhook remains available and takes precedence
when `MALWARE_SCAN_WEBHOOK_URL` is configured.

`MALWARE_SCAN_WEBHOOK_URL` receives the PDF bytes as `application/pdf` plus an
`X-MA-Watch-Resource-Id` header. A clean file must return a 2xx JSON response:

```json
{ "status": "clean" }
```

Explicit `infected`, `malicious`, `rejected` or `unsafe` results permanently
fail the job. A successful scan rewrites the object's private R2 metadata to
`scanStatus=clean`. Publications then move to Parsing (or Draft for Markets),
and applicant CVs become eligible for authorised download. Until that durable
job state and metadata agree, download and publishing remain blocked.

### PDF parser

The recommended direct provider is Adobe PDF Extract. Set
`ADOBE_PDF_SERVICES_CLIENT_ID` and `ADOBE_PDF_SERVICES_CLIENT_SECRET` as
secrets and set `ADOBE_PDF_SERVICES_REGION=eu` for UK/EU document processing.
The durable job runner uploads each clean PDF, persists Adobe's asynchronous
poll state without tokens or signed URLs, and requeues ordinary `in progress`
responses without consuming the five-failure budget. It maps source-ordered
text, styles, links, lists, accessible rectangular tables and references.
Figure PNG renditions are bounded, extracted from the provider archive, stored
under deterministic private R2 asset keys and inserted into the draft with
empty alternative text, which deliberately blocks publication until an editor
writes a meaningful description. The custom webhook below takes precedence
when configured.

`PARSER_WEBHOOK_URL` receives clean Strategic or Legal PDF bytes. It must return
2xx JSON matching the parser contract: the publication ID, `draft` or
`parse-failed` status, parser version, ordered blocks, warnings and metadata.
Unsafe URLs, malformed or unsupported blocks, mismatched publication IDs and
oversized output are rejected. A valid body is capped at 750 KB by UTF-8 bytes,
with smaller caps for warnings and metadata. The result is retained as a parser
candidate revision and is applied only if the source and empty draft have not
changed since scanning; concurrent editorial work is never overwritten. Parser
output creates a Draft only; it never publishes content.

Adobe completion is not claimed to be exactly-once: Adobe does not document an
idempotency key for the initial Extract submission. A Worker failure after
remote acceptance but before its polling URL is stored can consume a duplicate
transaction. Monitor provider usage and keep the source/revision race guards in
place.

Retained candidates can be accepted from the authorised publication revision
history with **Apply this revision**. The confirmation deliberately moves the
publication to Draft and removes any active public or scheduled state. The
current body is retained as a new snapshot in the same database batch as the
validated restore and audit entry.

## Readiness and monitoring

`GET /api/health` checks that D1 can answer a query and that the private R2
binding can perform a read-only HEAD. When `REQUIRE_PRODUCTION_SERVICES=true`,
it also checks analytics enablement, provider and maintenance-monitor
configuration without returning URLs or secret values. It returns `200` with
coarse check names or `503` without
internal error details. `HEAD /api/health` provides the same status without a
body.

Before launch, configure external monitoring for:

- repeated readiness failures;
- Failed jobs and a growing queue of old jobs;
- maintenance trigger absence or repeated execution failure;
- provider authentication, timeout and rejection rates;
- D1 and R2 backup completion.

Assign an owner and escalation channel. No monitoring destination is configured
in this repository.

## Non-destructive release verification

After the normal local `npm run verify`, exercise a deployed candidate with:

```text
SMOKE_BASE_URL=https://candidate.example.org npm run verify:release
```

For a private Sites candidate, inject `SMOKE_SITES_BYPASS_TOKEN` from a
short-lived secret source rather than committing it or pasting it into the
command history. The script sends it only in Sites' dedicated
`OAI-Sites-Authorization` header; it never reuses the application's
`Authorization` header. Release mode refuses loopback or plain-HTTP targets,
makes only GET and HEAD requests, requires production-service enforcement to
report `ok`, checks the public route set, readiness, no-store behaviour, browser
security headers, robots rules and sitemap privacy. It does not upload a file,
submit an application, publish an item or invoke maintenance.

## Backup and restoration gate

D1 production databases have always-on Time Travel. Confirm the database reports
the production storage backend and record its current bookmark with
`wrangler d1 time-travel info`. Time Travel covers up to 30 days on Workers Paid
or seven days on Workers Free, but restore overwrites the database in place and
cancels in-flight queries. Never use a production Time Travel restore as a
rehearsal.

For an isolated restoration drill, take a D1 SQL export during an approved
low-traffic window and import it into a separately named recovery database.
Cloudflare documents that an export blocks other database requests, so it is not
a zero-impact production operation. For retention beyond the Time Travel window,
approve and automate D1 exports to a restricted backup destination.

R2's storage durability does not protect against intentional or accidental
deletion. Select a separate recovery destination and create a versioned inventory
containing object keys, sizes, checksums and snapshot time. Use the S3-compatible
API to copy into an isolated recovery bucket, then sample-download and verify
checksums. Bucket locks can prevent overwrite/deletion, but do not apply a lock
to applicant objects until the privacy owner confirms it will not obstruct a
retention expiry or deletion request. Any applicant data in a backup must follow
the same approved retention/deletion policy as the live copy.

Before launch, perform and record this recovery exercise:

1. Record the D1 bookmark and the R2 inventory cut-off time; capture the SQL
   export and matching object snapshot.
2. Import the SQL export into a separately named recovery D1 database and copy
   objects into a separately named recovery R2 bucket. Never point the drill at
   live resources.
3. Deploy or bind an isolated recovery environment to those resources, with
   email/scanner/parser integrations disabled or routed only to test sinks.
4. Verify applicant-to-CV and publication-to-source references against the R2
   inventory, including object size and checksum where available.
5. Verify a published report, a quarantined file and a scheduled publication,
   then run `/api/health` and `npm run test:smoke` against the recovery URL.
6. Run the protected maintenance cycle twice in recovery and confirm the second
   run does not duplicate an email or publication transition.
7. Record date, owner, D1 bookmark/export, R2 inventory, restored resources,
   checks, exceptions and privacy-compliant cleanup.

Do not treat R2 durability, the application build, Time Travel availability or
this runbook as evidence that a matching file backup exists or that restoration
has been tested. The launch owner must retain drill evidence and approve the
recovery point and recovery time objectives.

Cloudflare references: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/),
[D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/),
[D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/),
[R2 durability](https://developers.cloudflare.com/r2/reference/durability/), and
[R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/).
