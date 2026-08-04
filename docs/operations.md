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
5. Configure the three provider adapters below and verify them in staging.

`.env.example` lists the complete local variable names. Never copy real tokens
into that committed file.

## Maintenance trigger

The Worker exports a `scheduled` handler. Provision a recurring trigger with the
hosting owner; one-minute or five-minute cadence is suitable for scheduled
publishing, depending on the editorial precision agreed for launch.

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

`EMAIL_WEBHOOK_URL` receives JSON with `to`, `subject`, `text`, `template` and
non-sensitive template data. It must return a 2xx response only after accepting
the idempotent delivery. CV bytes and private object keys are never included.

### Malware scanner

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

`PARSER_WEBHOOK_URL` receives clean Strategic or Legal PDF bytes. It must return
2xx JSON matching the parser contract: the publication ID, `draft` or
`parse-failed` status, parser version, ordered blocks, warnings and metadata.
Unsafe URLs, malformed or unsupported blocks, mismatched publication IDs and
oversized output are rejected. A valid body is capped at 750 KB by UTF-8 bytes,
with smaller caps for warnings and metadata. The result is retained as a parser
candidate revision and is applied only if the source and empty draft have not
changed since scanning; concurrent editorial work is never overwritten. Parser
output creates a Draft only; it never publishes content.

Retained candidates can be accepted from the authorised publication revision
history with **Apply this revision**. The confirmation deliberately moves the
publication to Draft and removes any active public or scheduled state. The
current body is retained as a new snapshot in the same database batch as the
validated restore and audit entry.

## Readiness and monitoring

`GET /api/health` checks that D1 can answer a query and that the private R2
binding can perform a read-only HEAD. It returns `200` with coarse check names or
`503` without internal error details. `HEAD /api/health` provides the same status
without a body.

Before launch, configure external monitoring for:

- repeated readiness failures;
- Failed jobs and a growing queue of old jobs;
- maintenance trigger absence or repeated execution failure;
- provider authentication, timeout and rejection rates;
- D1 and R2 backup completion.

Assign an owner and escalation channel. No monitoring destination is configured
in this repository.

## Backup and restoration gate

Automated D1 and R2 backups, retention and alerts must be enabled through the
chosen hosting plan. Before launch, perform and record a staging restoration:

1. Capture a database backup and a matching private-file snapshot.
2. Restore both into isolated staging resources.
3. Verify applicant-to-CV and publication-to-source references.
4. Verify a published report, a quarantined file and a scheduled publication.
5. Run `/api/health`, then a maintenance cycle, and confirm no duplicate email or
   publication transition occurs.
6. Record date, owner, source snapshot, restored resources, checks and cleanup.

Do not treat the application build or this runbook as evidence that backups are
enabled or that restoration has been tested.
