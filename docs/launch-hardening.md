# Launch hardening — 3 October 2026

This change addresses the seven reproduced defects from the engineering review.
It does not sign off the hosted environment or enable production recruitment.

## Changes

- Article drafts and undo history survive metadata/cover saves. Workflow actions
  require the article's unsaved changes to be saved first. Applying an old
  revision explicitly replaces the editor buffer and resets its saved baseline.
- Publication mutations require `expectedVersion`. Every publication update,
  including background processing, advances a database-owned `edit_version`.
  Stale edits return 409 without discarding the browser's inputs. Successful
  saves advance the versions shared by the forms on that page.
- Editing a reviewed or scheduled body returns it to Draft and clears its
  schedule. A database trigger also enforces this for writers outside the API.
  Source replacement clears any old schedule/publication timestamp.
- Health checks verify the migrated application schema and version trigger,
  using read-only queries, before reporting readiness.
- Demo PDF routes run through the Worker before static-asset serving. Explicit
  demo mode forwards them to the ASSETS binding; managed mode returns 404.
- Applicant exports include all matching rows up to 10,000, with an explicit
  422 response above that limit instead of a partial download. Responses include
  `X-Export-Record-Count`. Applicant and publication lists have pagination.
- Patched Next, fflate, image-size, sharp and undici dependencies are installed.
  Compatible transitive dependencies were refreshed. Production audit reports
  zero vulnerabilities at the time of this change.

## Deployment and migration

Apply `0007_short_carmella_unuscione.sql` before serving the new build. The
migration adds `edit_version` and the `publications_edit_version` trigger.
The trigger is custom SQL, alongside the Drizzle-generated column/snapshot;
preserve it in future table-rebuilding migrations. Readiness checks require it.

**Existing Strategic/Legal publications in Review or Scheduled move to Draft,
and their schedules are cleared.** Their body content and revision history are
preserved. Previously approved bodies cannot be distinguished reliably from
bodies changed under the old bug, so they must be checked and sent through
Review again. Published items and Markets schedules are not reset by this
migration. Export/backup the database and review the affected list first.

Deploy the frontend and API together; older browser tabs do not send the new
version token and will receive a conflict until reloaded. The version trigger
also increments for background changes, so an editor sees a reload notice after
processing completes instead of having its unsaved inputs replaced.

The static routing configuration has been verified through the generated
Wrangler production config. Confirm that the actual hosting pipeline preserves
the ASSETS binding and Worker-first `/sample-reports/*` routing.

## Verification

Run `npm run verify` for type checking, lint, unit tests, a deterministic
production build, rendered/API tests and the production-runtime suite.

`npm run test:runtime` requires a built `dist/`. It creates isolated temporary
D1/R2 storage and loopback-only Wrangler processes, then cleans them up. It
checks missing-schema readiness, real asset routing in both modes, stale edits,
review/schedule invalidation, publishing/PDF bytes, cover/revision/source
operations, list pagination, a 501-row export and refusal above 10,000 rows.
The scan acceptance and authenticated identities in this suite are synthetic;
it does not contact scanning, email or parsing providers.

Browser regression checks also exercised:

1. Edit article text, save metadata, verify text and undo remain, then save the
   article successfully without a reload.
2. Try advancing the workflow with unsaved article text; the action is blocked.
3. Load two editors, save a new title in one, and save metadata in the other;
   the stale editor receives a conflict and keeps its entered text.
4. Edit a reviewed article; it returns to Draft and explains the cleared review.
5. Apply a retained revision; the editor shows that body and a saved baseline.

## Remaining launch work

- Confirm the demo URL, hosting project and intended live domain. Verify hosted
  identity-header stripping and sign-in before treating local identity tests as
  evidence of production access control.
- Configure and test actual scanning, transactional email and Adobe extraction.
  Check representative PDFs against the original tables, reading order, images
  and footnotes; synthetic parser tests cannot establish conversion quality.
- Provision exactly one monitored scheduler and test backup restoration.
  The current default is still five jobs per invocation. At five-minute
  intervals, three jobs per application imply around 20 applications/hour
  before retries or other work. Queue throughput and provider rate limits need
  a separate capacity pass before a recruitment campaign.
- Run hosted `npm run verify:release` with the real HTTPS candidate URL and
  production service enforcement. Keep application intake closed until the
  provider, retention and privacy configuration checks pass.
- Perform broader accessibility, device/browser and load testing. Public
  catalogue search still filters metadata in memory and should move to indexed
  database queries as the catalogue grows.
- The full development audit still reports eight affected package entries from
  the `braces` denial-of-service advisory through lint/build glob tooling. npm's
  latest braces release checked was 3.0.3, which remains in the affected range.
  Do not accept the suggested forced framework changes/downgrade blindly; track
  upstream fixes and assess a separately tested toolchain upgrade. The
  production-only audit is clear; that is not a blanket security certification.

No deployment, production-data migration or real provider configuration was
performed as part of this change.
