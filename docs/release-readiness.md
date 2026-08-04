# Release readiness

**Status:** code-complete candidate for private stakeholder staging. Public
launch and live application intake remain blocked on the external gates below.

## Implemented release boundary

- Responsive public Home, Reports, Strategic, Legal, Markets, Team, Info,
  Apply, policy and accessibility routes.
- D1-managed publishing, editorial review, revisions, schedules, featured
  content, safe search/filtering and clean PDF delivery.
- Private R2 sources, CVs and managed images with bounded upload parsing,
  structural validation, quarantine/reference checks and short-lived public
  cache revalidation.
- Invitation-only Admin/Super User access, server-side RBAC, account controls,
  applicant workflow, audited exports/downloads and retention deletion jobs.
- Durable scan, parser and email jobs with idempotency keys, bounded response
  reads, retry/backoff, lease recovery and per-claim fencing.
- Direct Resend, Cloudmersive and Adobe PDF Services adapters plus secure custom
  webhook alternatives.
- Draft/publish CMS for homepage, structured Info content and footer links,
  including managed media and exact authenticated previews.
- Cookie-free daily aggregate first-party analytics with an explicit enable
  switch and 400-day retention.
- Security headers, health/readiness checks, monitoring hooks, migration-only
  schema ownership, smoke tooling and backup/restore runbooks.

## External public-launch gates

1. Configure Adobe PDF Services in the agreed region and obtain editorial
   acceptance for all five representative reports.
2. Configure a verified transactional sender, recipient list and malware
   scanner; exercise success, rejection, timeout and retry paths.
3. Provision the recurring maintenance trigger, heartbeat/failure alerts and
   D1/R2 backups; complete a recorded restore drill.
4. Approve privacy, retention/deletion, recruitment, disclaimer and contact
   copy. Keep application intake closed until that approval and provider testing
   are complete.
5. Confirm production identity membership, initial Super User, MFA/session
   policy, domain and DNS. Keep the staging deployment owner-only until an
   explicit access decision.
6. Complete final-browser, keyboard, screen-reader, WCAG 2.2 AA, performance,
   privacy and security acceptance with the final content and real providers.

## Required verification before each deploy

Run `npm run verify`, apply every migration to a fresh local D1 database, run
`npm audit --audit-level=high`, and run `npm run verify:release` against the
private candidate. No production-service readiness override should be enabled
until every external gate represented by `/api/health` is genuinely configured.
