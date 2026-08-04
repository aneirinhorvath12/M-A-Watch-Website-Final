# Senior engineering review

> Superseded by `docs/release-readiness.md`. This document records an earlier
> review snapshot and its test counts must not be treated as current.

**Reviewed:** 4 August 2026  
**Scope:** final integrated M&A Watch repository, including public routes, D1/R2 persistence, admin/RBAC, applications, publishing, parser jobs, structured editing and Sites build output.

## Verdict

**GO for a private stakeholder demonstration and continued staging work.**  
**NO-GO for public production launch or live application intake until the external launch gates below are completed and exercised.**

The final code review found no unresolved P0/P1 implementation defect in the checked-in demo boundary. The complete Node 22.22.2 verification passed after the review fixes: TypeScript, ESLint, 18 unit/policy tests, vinext production build and three rendered integration tests.

## Material findings resolved during review

- Public D1-backed pages are explicitly dynamic, and a rendered integration test proves that newly published content appears on the next request.
- Static demonstration records cannot reappear over a D1-managed unpublished or inactive record.
- First-Super-User bootstrap is allowlisted, atomic and fails closed; final-Super-User protections remain server enforced.
- Applicant storage and its email/scan outbox rows are atomic; CVs and report sources remain private and quarantined until an explicit clean scan result.
- Background work is reachable through a protected maintenance endpoint and scheduled Worker hook, with leases, bounded retries, stable idempotency keys and D1-query-budget-aware batches.
- Integration endpoints require HTTPS, with only an explicit loopback HTTP development exception.
- Parser output is strictly shape validated and UTF-8 byte bounded. It is applied only to an unchanged empty draft; otherwise it is retained as a candidate revision without overwriting editorial work.
- Revision restore snapshots the current body and atomically applies the selected safe revision to Draft with bounded search text and an audit record.
- Review is required before Strategic or Legal publication/scheduling; body changes cannot be smuggled into the publish action.
- Publication rows stay below D1's row-size boundary, do not duplicate the full article body into search text, and collection reads avoid selecting article bodies.
- D1 LIKE patterns are UTF-8 bounded and job payload lookups use exact JSON fields.
- Request-time schema creation was removed. Checked-in migrations are the schema authority; runtime performs a lightweight readiness check and fail-closed seed only.
- The structured editor, managed images and private preview use the same controlled block model and public article renderer.
- Public/admin client bundles no longer traverse the server-only publication barrel; the final vinext client build is clean.

## Remaining production gates

1. Connect and accept a real PDF extraction provider against reviewed golden outputs for all five representative reports, including tables, images, page-spanning content and references.
2. Provision and test the malware scanner, transactional email, scheduler, monitoring, analytics/consent, D1/R2 backups and restoration process.
3. Configure the production hosting identity/access policy, initial Super User, MFA/session policy, domain/DNS and final runtime secrets.
4. Approve applicant retention/deletion, privacy/legal wording, email sender/recipient configuration and live recruitment contact details before applications are opened.
5. Run production-like D1/R2 integration and race tests for RBAC, final-Super-User concurrency, private files, applications, publishing, revision restore and background-job recovery.
6. Complete browser, keyboard, screen-reader, WCAG 2.2 AA, performance, security and privacy acceptance with final launch content.

The detailed product traceability and ownership checklist is in `docs/product-acceptance-checklist.md`; operational configuration and recovery steps are in `docs/operations.md`.
