# M&A Watch MVP — Product Acceptance and Spec Traceability Checklist

**Source specification:** `mna-watch-website-product-spec.md`, version 1.0, 4 August 2026  
**Repository snapshot reviewed:** 4 August 2026, 15:42 BST  
**Purpose:** Working acceptance register for implementation, product QA and launch sign-off.

## How to use this checklist

Priorities:

- **P0** — Launch blocker: required for the MVP to work safely or satisfy a core product promise.
- **P1** — Required MVP completeness or quality item; launch needs an explicit product-owner waiver if incomplete.
- **P2** — Valuable refinement, strong recommendation or future-ready provision that can follow the first safe launch.

Statuses:

- **Implemented** — The acceptance condition has direct evidence in the reviewed repository.
- **Partial** — A material portion exists, but the full condition is not implemented or lacks required end-to-end acceptance evidence.
- **Planned** — No material implementation or acceptance evidence exists yet.
- **Needs external setup** — Requires a stakeholder decision, supplied content, credentials, provider configuration or operational sign-off outside the codebase.

An item is accepted only when its condition has been exercised in a production-like environment. A successful build alone is not acceptance evidence for data, permissions, accessibility, privacy, scheduled jobs, email or file-handling behaviour.

## Current repository baseline

| Area | Status | Evidence / implication |
|---|---|---|
| Sites-compatible product shell and build | Implemented | Branded public/admin routes replace the starter. The last pre-editor `npm run verify` passed on Node 22.22.2: typecheck, lint, 18 unit/policy tests, production build and three server-rendered tests. The current editor, exact-preview and managed-image waves await the senior's final freeze verification. |
| Brand and public design | Partial | Four supplied logo assets, a bespoke social card, responsive CSS and a coherent editorial visual direction are implemented. Partner logos, social links and final content approval remain open. |
| Parser fixture assets | Partial | All five supplied PDFs are present and registered in the fixture manifest; tests verify the manifest and parser contract only. No extractor runs those PDFs or compares golden output. |
| Public product routes | Partial | All specified public routes, listings, search/filtering, article/PDF experiences, legal pages and an authorised exact private-preview route exist. Browser QA, cover images and several CMS-controlled sections remain incomplete. |
| Persistence and files | Partial | D1/R2 bindings, schema, migrations, private random object keys and authenticated CV/public-PDF handlers exist. Production resources, malware scanning, backups and restoration are not configured. |
| Authentication and authorisation | Partial | Hosting identity is checked against a D1 invitation/role/status allowlist; Admin/Super User server guards and final-Super-User rules exist. Session policy, MFA/access-policy setup and end-to-end RBAC tests remain external or absent. |
| Admin and applications | Partial | Dashboard, structured publication editor/workflow, managed article images, exact private preview, applicant pipeline, account/team/content management, audit and durable jobs are implemented broadly. The real PDF extractor remains incomplete, and provider-backed email/scanning are not live. |
| Automated acceptance evidence | Partial | The pre-editor tree has CI and 21 passing tests (18 unit/policy plus three rendered), including publication visibility, parser/revision validation and a D1-backed freshness simulation. The current editor/preview/image waves have no browser or storage-boundary integration tests and await final freeze verification; there is still no real D1/R2 route integration suite, parser golden-output suite, RBAC matrix, private-file tests, application end-to-end test, accessibility audit or browser matrix. |

## Evidence index

- **Public/UX:** `app/page.tsx`, public route files, `components/site/*`, `components/publications/*`, `app/globals.css`, and `tests/rendered-html.test.mjs`.
- **Publishing/parser:** `db/schema.ts`, `app/api/admin/publications/*`, `app/admin/(protected)/publications/*`, `lib/job-runner.ts`, `lib/parser/*`, and `tests/parser.test.ts`.
- **Applications/admin:** `app/api/applications/route.ts`, `app/api/admin/applicants/*`, `app/api/admin/users/*`, protected admin pages, `lib/admin-auth.ts`, and `lib/admin-data.ts`.
- **Security/operations:** `lib/security*.ts`, `app/api/files/applicants/*`, `app/api/maintenance/route.ts`, `worker/index.ts`, `docs/operations.md`, and policy tests.
- **Build evidence:** `npm run verify` passed on 4 August 2026 before the editor/preview/image waves. Final freeze verification is pending and will still not exercise real D1/R2, provider webhooks, hosted identity or production scheduling.

## 1. Public site

**Evidence:** Branded routes and responsive components are implemented in `app/`, `components/site/` and `components/publications/`; rendered smoke tests cover the homepage and Strategic collection. Active Admins can open a noindexed `/preview/publications/{id}` view which renders the draft through the production publication components without changing stored/public state; its source-PDF endpoint is authenticated, audited, non-cacheable and restricted to clean-scanned objects. No browser, mobile, visual-regression, preview-authorisation integration or full navigation acceptance run has been recorded. The public data layer deliberately falls back to hard-coded demonstration publications/team content when D1 is unavailable, which is not acceptable production editorial control without an explicit release-mode change.

| ID | Pri | Status | Acceptance check | Spec |
|---|---:|---|---|---|
| WEB-001 | P0 | Partial | Every public page has the M&A Watch logo linked to `/`, responsive primary navigation, a visible current-page state and a complete footer. | 5.1, 6.1 |
| WEB-002 | P0 | Implemented | Primary navigation exposes Home, Strategic Deal Reports, Legal Reports, Markets, Apply, Team and Info at mobile and desktop widths. | 5.1 |
| WEB-003 | P1 | Partial | Footer exposes the configured contact email, social links, Privacy, Terms/content disclaimer, Accessibility and copyright. | 5.1, 6.1 |
| WEB-004 | P0 | Implemented | All required public routes exist and return intentional page, empty or not-found states rather than framework errors. | 5.2, 15.1 |
| WEB-005 | P0 | Partial | Public layouts work without horizontal scrolling on supported mobile, tablet and desktop widths. | 6.1, 11, 15.1 |
| WEB-006 | P1 | Implemented | Homepage hero gives a concise value proposition and clear publication/application calls to action. | 6.2 |
| WEB-007 | P1 | Implemented | Homepage includes an organisation overview and explains Strategic, Legal and Markets outputs distinctly. | 6.2 |
| WEB-008 | P1 | Partial | Homepage shows latest or explicitly featured published items from Strategic, Legal and Markets; private statuses never leak into the section. | 6.2 |
| WEB-009 | P1 | Partial | Homepage supports editable impact statistics/highlights and links to Team and Info. | 6.2 |
| WEB-010 | P2 | Planned | Homepage can show supplied partner/chapter logos with useful alternative text and sensible empty behaviour when none are configured. | 6.2 |
| WEB-011 | P0 | Implemented | Homepage application call to action reflects the current open/closed application state. | 6.2, 6.8 |
| WEB-012 | P0 | Partial | Strategic listing shows only Published reports, newest first, with title, date, summary and available author/chapter and cover information. | 6.3, 15.1 |
| WEB-013 | P0 | Implemented | Strategic cards open the correct web report; every report page includes a working original-PDF action. | 6.3, 6.4, 15.1 |
| WEB-014 | P1 | Implemented | Strategic listing keyword search and year plus author/chapter filters work when corresponding data exists. | 6.3 |
| WEB-015 | P1 | Implemented | Strategic listing has pagination or progressive loading and a clear no-match/empty state. | 6.3, 14 |
| WEB-016 | P2 | Partial | Publication data design can add industry, geography and deal-status filters without rebuilding the collection. | 6.3, 8.1 |
| WEB-017 | P0 | Implemented | Strategic report page renders approved title, date, attribution, summary and web body in logical order. | 6.4 |
| WEB-018 | P0 | Partial | Approved report pages correctly render supported headings, paragraphs, emphasis, lists, images, captions, links, references and accessible tables. | 6.4, 15.2 |
| WEB-019 | P0 | Partial | Draft, Uploaded, Parsing, Review, Scheduled, Archived, Parse failed and disabled records cannot be fetched through public report routes or search. | 6.4, 7.3, 10.1 |
| WEB-020 | P1 | Implemented | Authorised users can open a private preview without changing a publication's public state. | 6.4, 7.3 |
| WEB-021 | P2 | Implemented | Report pages show related items and previous/next navigation when data permits, with sensible omission when it does not. | 6.4 |
| WEB-022 | P0 | Implemented | Legal listing and report pages meet the Strategic behaviour while remaining clearly labelled and distinct in navigation and URLs. | 5.2, 6.5, 15.1 |
| WEB-023 | P0 | Partial | Markets listing shows only Published newsletters, newest first, with title, date, summary and optional cover. | 6.6 |
| WEB-024 | P1 | Implemented | Markets keyword search, year filter and empty states work without attempting full-text indexing of PDF contents. | 6.6, 10.1, 14 |
| WEB-025 | P2 | Partial | Markets records can accept a future category without adding multiple public subsections in the MVP. | 3.2, 6.6, 8.1 |
| WEB-026 | P0 | Implemented | Markets page shows metadata, attribution when supplied, an embedded PDF where supported and a prominent open/download action. | 6.7, 15.1 |
| WEB-027 | P0 | Implemented | Markets page has a tested fallback message and download link when inline PDF embedding is unavailable. | 6.7, 14 |
| WEB-028 | P0 | Implemented | Markets PDFs never pass through or display output from the Strategic/Legal parser. | 6.7, 7.6, 15.2 |
| WEB-029 | P1 | Partial | Info is a designed responsive page supporting controlled headings, text, images, links and calls to action, including an acceptable placeholder state. | 6.9, 15.1 |
| WEB-030 | P1 | Implemented | Team page groups active members by leadership/team category and respects configured display order. | 6.10 |
| WEB-031 | P1 | Partial | Team cards support name, role, group, biography, optional LinkedIn and a photograph or accessible fallback. | 6.10, 8.4 |
| WEB-032 | P0 | Implemented | Inactive team records cannot appear on the public Team page. | 6.10 |

## 2. Publishing and parser

**Evidence:** D1 models, private R2 uploads, state transitions, scheduling, revision rows, quarantine, durable jobs and public visibility boundaries exist. Strategic/Legal publish and schedule actions require an existing Review state and reject same-request body edits. Authorised Admins can apply a validated prior revision; the action snapshots the current body, returns the item to Draft and records an audit event. The editor provides controlled block add/delete/reorder, undo/redo, unsaved-change protection, inline formatting/links, every supported block type and desktop/mobile live preview using the production `ArticleBody`. JPEG/PNG/WebP article images have authenticated upload/replace controls, 5 MB MIME/magic validation, UUID private-R2 keys, audit events and an access route that is Admin-only for drafts and public only after publication; external HTTPS images load browser-direct rather than through the optimiser. An Admin control also opens the full draft through the production `ArticlePublicationPage` or `MarketsPublicationPage` in the public root layout, with noindex/robots protection and a clean-scanned private source endpoint. The parser is only a contract/prototype plus an external webhook boundary and does not extract any supplied PDF. Parser completion uses an optimistic `updated_at`/empty-body guard and retains a candidate revision when editorial content changed; these controls have not been exercised against real D1/R2.

| ID | Pri | Status | Acceptance check | Spec |
|---|---:|---|---|---|
| PUB-001 | P0 | Partial | Publication records contain all shared fields: type, title, unique slug, summary, date, status, schedule, attribution, cover, PDF, authorship/audit timestamps, featured flag and search metadata. | 8.1 |
| PUB-002 | P0 | Implemented | Strategic/Legal records also persist approved web body, parser version/status/warnings/errors, revision history and optional deal metadata. | 8.1 |
| PUB-003 | P1 | Partial | Markets records support an empty/default Markets category for future extension. | 8.1 |
| PUB-004 | P0 | Implemented | Admin publication index can search and filter by type/status and clearly identifies records needing review or attention. | 7.2, 7.3 |
| PUB-005 | P0 | Implemented | Admin can create Strategic, Legal and Markets records and edit their metadata. | 7.3 |
| PUB-006 | P0 | Implemented | Workflow enforces the statuses Uploaded, Parsing, Draft, Review, Scheduled, Published, Archived and Parse failed. | 7.3 |
| PUB-007 | P0 | Implemented | Only an explicit authorised publish or schedule action can make content public; parsing never publishes. | 2, 7.4, 7.5, 15.2 |
| PUB-008 | P0 | Implemented | Admin can publish now, unpublish and archive; actor and timestamps are retained. | 7.3, 8.1 |
| PUB-009 | P0 | Partial | Scheduling stores timezone-safe timestamps, uses Europe/London editorial time and handles daylight-saving boundaries correctly. | 7.3, 14 |
| PUB-010 | P0 | Partial | A due Scheduled item becomes Published automatically and exactly once, including after a temporary scheduler outage. | 7.3, 12, 14 |
| PUB-011 | P0 | Implemented | Duplicate slugs are blocked with a clear resolution path; duplicate titles remain manageable. | 7.3, 14 |
| PUB-012 | P0 | Partial | Strategic/Legal upload validates configured size and PDF content type, rejects corrupt/encrypted/image-only inputs appropriately and stores the original securely. | 7.4, 13.1, 14 |
| PUB-013 | P0 | Needs external setup | Uploaded report PDFs are malware-scanned before parsing or downstream access. | 7.4, 13.1 |
| PUB-014 | P0 | Partial | Parsing executes outside the upload request and continues after the Admin closes the page. | 7.4, 12, 14 |
| PUB-015 | P0 | Partial | Parser output preserves logical document order across page breaks and page-spanning blocks. | 7.5, 11, 15.2 |
| PUB-016 | P0 | Partial | Parser handles document title, multiple heading levels, paragraphs and bold/italic/combined emphasis without rewriting source content. | 7.5, 15.2 |
| PUB-017 | P0 | Partial | Parser handles ordered/unordered lists and hyperlinks in document order. | 7.5, 15.2 |
| PUB-018 | P0 | Partial | Parser extracts web-quality images and consistent captions without silently losing or inventing content. | 7.5, 15.2 |
| PUB-019 | P0 | Partial | Parser extracts basic tables into an editable, responsive and accessible representation or requires an accessible replacement before publish. | 7.5, 11, 15.2 |
| PUB-020 | P0 | Partial | Parser retains consistently represented references/footnotes and their relationship to body content. | 7.5 |
| PUB-021 | P0 | Partial | Unsupported or uncertain structures create visible, actionable warnings and possible-omission notices. | 7.4, 7.5, 14, 15.2 |
| PUB-022 | P0 | Implemented | Parse failure retains the original PDF and offers replace/retry or manual-draft recovery. | 7.4, 7.5, 14 |
| PUB-023 | P0 | Partial | Parser retry is idempotent and cannot create duplicate publication records. | 12 |
| PUB-024 | P0 | Partial | Parser completion/failure is surfaced to the Admin, including an accessible background-process announcement when the page remains open. | 7.2, 11 |
| PUB-025 | P0 | Partial | Replacement PDF creates a revision; re-parsing requires confirmation and never silently overwrites approved manual edits. | 7.3, 7.5, 14, 15.2 |
| PUB-026 | P0 | Implemented | Prior approved revisions remain accessible to authorised users after source replacement/re-parse. | 7.3, 7.5, 15.2 |
| PUB-027 | P0 | Implemented | Structured editor supports undo/redo, save-without-publish, block add/delete/reorder and unsaved-change warnings. | 7.5, 7.7 |
| PUB-028 | P0 | Implemented | Editor supports controlled headings, emphasis, clear formatting, links, images/replacements, captions, alt text and tables. | 7.7 |
| PUB-029 | P0 | Implemented | Editor prevents arbitrary fonts, colours or layout code from escaping the design system. | 7.7 |
| PUB-030 | P0 | Implemented | Publication cannot enter Published state while a meaningful image lacks editable alternative text or a documented decorative designation. | 7.5, 11, 14 |
| PUB-031 | P1 | Implemented | Admin can preview the exact public output at desktop and mobile widths before review/publish. | 7.4, 7.6, 7.7 |
| PUB-032 | P0 | Partial | Markets workflow validates and stores a PDF, collects required metadata, supports preview/publish/schedule and invokes no parser job. | 7.6, 15.2 |
| PUB-033 | P0 | Partial | Parser test suite uses representative fixtures and asserts block order, supported structures, warnings, failures and revision safety. | 7.5, 14, 15.2, 18 |
| PUB-034 | P1 | Partial | Admin can see who last edited and published each record and relevant revision/audit information. | 7.3, 8.1 |

## 3. Applications

**Evidence:** The public form, server validation, idempotency key, closed-state recheck, private CV quarantine, applicant/status/note/history screens, filtered CSV and audit hooks are implemented. The queued applicant receipt states the division, non-acceptance wording and `hello@mawatch.org`; the Admin message targets the authenticated `/admin/applicants/{id}` record and neither attaches the CV. Email delivery and scanning remain unexercised until external providers are connected.

| ID | Pri | Status | Acceptance check | Spec |
|---|---:|---|---|---|
| APP-001 | P0 | Implemented | When open, `/apply` shows configurable introduction plus required name, university, email, division, CV and privacy-acknowledgement fields. | 6.8 |
| APP-002 | P0 | Implemented | Division accepts exactly Law, Finance or Markets in the MVP; storage can support future configuration. | 6.8, 7.9, 8.2 |
| APP-003 | P0 | Implemented | Client and server validation reject missing fields, malformed email and invalid division with clear inline errors. | 6.8, 15.3 |
| APP-004 | P0 | Implemented | CV validation accepts PDF content only, enforces a 10 MB maximum and does not trust the filename alone. | 6.8, 13.1, 14, 15.3 |
| APP-005 | P0 | Partial | CV is malware-scanned and stored privately; no stable public URL is generated. | 6.8, 13.1, 13.2, 15.3 |
| APP-006 | P0 | Partial | Public submission is protected against automated spam, CSRF and abusive request rates. | 6.8, 13.1 |
| APP-007 | P0 | Implemented | Submission re-checks the open/closed setting server-side, including when the form was opened before closure. | 6.8, 14, 15.3 |
| APP-008 | P0 | Implemented | Valid submission atomically creates exactly one applicant record and one private CV reference. | 6.8, 15.3 |
| APP-009 | P0 | Implemented | Duplicate/retried requests are idempotent enough that refresh or network retry cannot create accidental duplicate records. | 6.8, 15.3 |
| APP-010 | P0 | Implemented | Successful submission redirects to a non-resubmitting confirmation state. | 6.8 |
| APP-011 | P0 | Implemented | Applicant record stores status, privacy acknowledgement timestamp/policy version, submission time and consent-compatible source/campaign metadata. | 8.2 |
| APP-012 | P0 | Partial | Applicant receives a receipt email that states the division and contact details, implies no acceptance and contains no CV attachment. | 6.8, 9.1 |
| APP-013 | P0 | Partial | Configured Admin recipients receive applicant name, university, division, submission time and an authenticated record link, with no CV attachment. | 6.8, 9.2 |
| APP-014 | P0 | Partial | Email failure is logged and visible without rolling back an otherwise successful stored application. | 9.3, 14 |
| APP-015 | P0 | Implemented | When applications are closed, the form is absent, configurable closed copy is shown and the public endpoint rejects submissions. | 6.8, 7.9, 15.3 |
| APP-016 | P0 | Implemented | Admin applicant table supports search by name/university/email, division/status/date filters and sorting. | 7.8, 15.3 |
| APP-017 | P0 | Implemented | Applicant detail shows submitted data, status, timestamped internal notes and full actor-attributed status history. | 7.8 |
| APP-018 | P0 | Implemented | Supported statuses are New, Reviewing, Interview, Offered, Accepted, Rejected and Withdrawn. | 7.8, 8.2 |
| APP-019 | P0 | Partial | Authorised Admin/Super User can view and download a CV through an authenticated or short-lived access path; unauthorised access fails. | 7.8, 13.2, 15.3 |
| APP-020 | P1 | Implemented | Selected/filtered applicants export to CSV without CV files; the export is authorised and audited. | 7.8, 13.2 |
| APP-021 | P1 | Implemented | Same-email submissions create a possible-duplicate warning without automatic rejection. | 7.8, 14 |
| APP-022 | P0 | Implemented | Changing status does not send email unless an Admin explicitly chooses a configured email action. | 7.8 |
| APP-023 | P1 | Implemented | Admin can edit introduction, closed message and notification recipients and preview both open/closed states. | 7.9 |
| APP-024 | P0 | Implemented | Application settings expose one form/cycle only in the MVP and changes to open/closed state are audited. | 3.2, 7.9, 7.12 |
| APP-025 | P0 | Needs external setup | Stakeholders provide approved application, confirmation and closed-state copy plus recruitment contact details. | 6.8, 9.1, 16 |
| APP-026 | P0 | Needs external setup | A transactional email provider, verified sender address/name and notification-recipient list are configured for staging and production. | 9, 16 |

## 4. Admin, authentication and RBAC

**Evidence:** `lib/admin-auth.ts` combines hosting identity with the D1 account allowlist; page/API guards distinguish Admin and Super User, and account mutations protect self-disable and the final active Super User. Password/recovery, session lifetime and MFA are delegated to the identity/hosting layer and have not been verified in production. No automated test exercises the RBAC matrix, invitation acceptance, disabled-account access or concurrent final-Super-User mutations.

| ID | Pri | Status | Acceptance check | Spec |
|---|---:|---|---|---|
| ADM-001 | P0 | Partial | `/admin/login`, `/admin/forgot-password` and protected admin routes exist; there is no public registration route. | 3.2, 5.3, 7.1 |
| ADM-002 | P0 | Implemented | Administrative accounts are invitation-only and persist name, email, role, status, invitation expiry, last login and timestamps. | 7.1, 8.3 |
| ADM-003 | P0 | Partial | Time-limited invitation lets the intended recipient set a password exactly once; pending invitation can expire or be revoked. | 7.1, 7.10 |
| ADM-004 | P0 | Partial | Password recovery uses a time-limited link and generic responses that do not reveal account existence. | 7.1, 9.3 |
| ADM-005 | P0 | Partial | Disabled users cannot sign in or reset a password. | 7.1, 15.4 |
| ADM-006 | P0 | Partial | Disabling an active account invalidates all active sessions immediately. | 7.1, 13.3, 14, 15.4 |
| ADM-007 | P0 | Needs external setup | Admin sessions expire after an agreed inactivity period and use secure cookie/session settings. | 7.1 |
| ADM-008 | P0 | Partial | Server-side guards enforce every capability in the permission matrix; hiding controls in the UI is not treated as authorisation. | 4.4, 13.1, 15.4 |
| ADM-009 | P0 | Implemented | Admins can manage publications, applicants, application state, team and content, but every user-account management action is denied. | 4.2, 4.4, 15.4 |
| ADM-010 | P0 | Implemented | Super Users receive Admin capabilities plus invite/resend/revoke, role, disable/reactivate and account-activity controls. | 4.3, 7.10, 15.4 |
| ADM-011 | P0 | Implemented | A signed-in Super User cannot disable their own account. | 7.10 |
| ADM-012 | P0 | Partial | Transactions prevent disabling or demoting the final active Super User under concurrent requests. | 7.10, 14, 15.4 |
| ADM-013 | P0 | Implemented | Role and account-state changes require explicit confirmation and are audited. | 7.10, 7.12 |
| ADM-014 | P0 | Implemented | Disabled users remain clearly attributed to historical publications and audit events; permanent account deletion is unavailable. | 3.2, 4.3, 7.10, 13.3, 15.4 |
| ADM-015 | P1 | Implemented | Account list distinguishes Invited, Active and Disabled and displays last successful login. | 7.10, 8.3 |
| ADM-016 | P1 | Implemented | Dashboard shows items awaiting review, recent/scheduled publications and parser warnings/failures. | 7.2 |
| ADM-017 | P1 | Implemented | Dashboard shows new/status-grouped applications, application open/closed state and recent relevant activity. | 7.2 |
| ADM-018 | P0 | Partial | Audit log captures security login events, account changes, publication lifecycle/source replacement, applicant status, form state and public content publishing. | 7.12 |
| ADM-019 | P0 | Implemented | Every audit record has actor, action, affected record and timestamp and cannot be edited through the admin interface. | 7.12 |
| ADM-020 | P1 | Implemented | Admins see relevant audit history while account controls/account-specific history remain Super User-only where required. | 4.2, 4.3, 7.12 |
| ADM-021 | P1 | Needs external setup | Stakeholders name the initial Super User and confirm authorised Admin/Super User membership before production seeding. | 4, 16 |
| ADM-022 | P2 | Needs external setup | MFA method and enforcement policy are selected; MFA is enabled at minimum for all Super Users. | 7.1 |

## 5. Team and public content management

**Evidence:** Team CRUD/order/active state and constrained draft/publish content APIs exist. Homepage editing covers only hero/overview; impact statistics, research-area copy, partner data and social links are not managed. Team photo paths/alt text can be saved, but the public team query and page never use them. Info editing is limited to a title and plain body rather than the required controlled rich blocks.

| ID | Pri | Status | Acceptance check | Spec |
|---|---:|---|---|---|
| CMS-001 | P1 | Implemented | Admin/Super User can create, edit, reorder, activate and deactivate team members. | 7.11 |
| CMS-002 | P1 | Partial | Team editor supports name, title, group, photo, photo alt text, biography, optional LinkedIn, order and active state. | 6.10, 8.4 |
| CMS-003 | P1 | Partial | Admin can edit designated homepage hero/overview/publication-area/statistics/application sections. | 6.2, 7.11 |
| CMS-004 | P1 | Implemented | Admin can select and clear featured publications without exposing a non-Published item. | 6.2, 7.11 |
| CMS-005 | P1 | Partial | Admin can edit Info title/body using controlled headings, text, images, links and calls to action. | 6.9, 7.11 |
| CMS-006 | P1 | Partial | Admin can manage contact and social links shown across the public site. | 5.1, 7.11 |
| CMS-007 | P1 | Implemented | Content fields/blocks are constrained so an editor cannot inject arbitrary layout, style or unsafe code. | 7.11, 13.1 |
| CMS-008 | P1 | Partial | Public content changes have a preview and an explicit publish action rather than becoming public mid-edit. | 7.11, 7.12 |
| CMS-009 | P1 | Implemented | Publishing a public-content change records an immutable audit event. | 7.12 |
| CMS-010 | P1 | Needs external setup | Stakeholders supply or approve placeholder/final homepage, Info, contact, social and legal content. | 6.2, 6.9, 16 |
| CMS-011 | P1 | Needs external setup | Stakeholders supply team records, groupings, display order, photos, photo rights and alternative text. | 6.10, 16 |
| CMS-012 | P2 | Needs external setup | Partner/chapter logos, destination links, usage rights and alternative text are supplied if that homepage section will launch. | 6.2, 16 |

## 6. Security and privacy

**Evidence:** Server allowlists, prepared D1 statements, request-origin checks, rate limiting for applications, PDF signature/size/active-content checks, quarantine metadata, private authenticated CV/report-source streaming and audits are implemented. Managed article images enforce JPEG/PNG/WebP MIME plus magic bytes and 5 MB limits, use private UUID object keys, and remain Admin-only until their publication is public. Malware scanning, hosted identity policy, HTTPS headers and backups are external. Origin checking accepts requests with no `Origin`, no retention/deletion implementation exists, and private-file/RBAC boundaries lack integration tests.

| ID | Pri | Status | Acceptance check | Spec |
|---|---:|---|---|---|
| SEC-001 | P0 | Needs external setup | Production enforces HTTPS with valid certificates and secure redirect/HSTS policy appropriate to the host. | 13.1 |
| SEC-002 | P0 | Needs external setup | Passwords use a reputable managed identity provider or modern one-way password hashing; plaintext or reversible password storage is impossible. | 13.1 |
| SEC-003 | P0 | Partial | Server-side validation and parameterised data access protect public/admin inputs against injection; rich content is sanitised on write and/or render. | 13.1 |
| SEC-004 | P0 | Partial | State-changing authenticated requests have CSRF protection appropriate to the chosen session design. | 13.1 |
| SEC-005 | P0 | Partial | Rate limits cover login, reset, invitation acceptance and application submission without exposing account existence. | 13.1 |
| SEC-006 | P0 | Partial | PDF/CV type checks inspect content signatures and reject corrupt, encrypted, executable or disallowed payloads safely. | 13.1, 14 |
| SEC-007 | P0 | Needs external setup | A malware-scanning service/process is selected, configured, monitored and tested with harmless industry-standard test fixtures. | 7.4, 13.1 |
| SEC-008 | P0 | Partial | Draft report files, CVs, parser output and internal errors never expose private bucket paths, stack traces or credentials. | 13.1, 13.2 |
| SEC-009 | P0 | Partial | CV access is limited to authorised Admin/Super Users through authenticated streaming or short-lived signed URLs. | 13.2, 15.5 |
| SEC-010 | P0 | Implemented | Applicant fields/CVs are excluded from public pages, public search, logs and analytics payloads. | 13.2, 15.5 |
| SEC-011 | P0 | Implemented | Applicant-record access, applicant export and CV download are audited with actor and timestamp. | 13.2 |
| SEC-012 | P0 | Implemented | Disabled account labelling, historical attribution and access blocking are consistent throughout admin and audit views. | 13.3 |
| SEC-013 | P0 | Needs external setup | Stakeholders approve a documented applicant/CV retention period, deletion process, lawful privacy wording and policy version. | 13.2, 16 |
| SEC-014 | P0 | Planned | Retention/deletion tooling can remove applicant data and private files according to policy while retaining only legally appropriate audit evidence. | 13.2 |
| SEC-015 | P0 | Needs external setup | Privacy, cookies/consent, terms/content disclaimer and applicant-rights copy receive authorised organisational/legal review. | 5.1, 13.2, 16 |
| SEC-016 | P1 | Partial | Dependency/security update process and production secret handling are documented; credentials are absent from source control and client bundles. | 13.1 |
| SEC-017 | P0 | Planned | Authorisation tests attempt direct-route/action access as anonymous, Admin, Super User and Disabled identities. | 4.4, 13.1, 15.4 |
| SEC-018 | P0 | Planned | Private-file tests prove unauthorised, expired and cross-record download attempts fail. | 13.2, 15.5 |

## 7. Accessibility and responsive quality

**Evidence:** Semantic landmarks, skip links, labels, inline error associations, live form status, focus styles, reduced-motion CSS, responsive breakpoints, table semantics and PDF fallbacks are present. No automated accessibility scan, assistive-technology run, zoom/reflow check, colour-contrast audit or agreed browser/device matrix has been completed. Background parser/job completion is not live-announced without a refresh.

| ID | Pri | Status | Acceptance check | Spec |
|---|---:|---|---|---|
| A11Y-001 | P0 | Partial | Public and admin critical paths meet WCAG 2.2 AA in automated checks and documented manual review. | 11, 15.5 |
| A11Y-002 | P0 | Partial | All navigation, forms, dialogs, editor controls, tables and admin actions work by keyboard alone. | 6.1, 11 |
| A11Y-003 | P0 | Partial | Interactive elements have visible, high-contrast focus indicators that are not clipped or hidden. | 6.1, 11 |
| A11Y-004 | P0 | Partial | Pages and parsed reports use one logical heading hierarchy and reading order. | 7.5, 11 |
| A11Y-005 | P0 | Partial | Brand colour combinations and UI states meet WCAG AA contrast; information never relies on colour alone. | 11 |
| A11Y-006 | P0 | Implemented | Form controls have programmatic labels/instructions and inline errors are associated with fields and announced. | 6.8, 11 |
| A11Y-007 | P0 | Partial | Meaningful images require useful alt text; decorative images are hidden appropriately; missing team photos have an accessible fallback. | 6.10, 7.5, 11 |
| A11Y-008 | P0 | Partial | Complex report graphics have supplied captions/descriptions or block publication pending an accessible alternative. | 11 |
| A11Y-009 | P0 | Implemented | Data tables have headers, captions/context and a small-screen strategy that preserves relationships. | 7.5, 11 |
| A11Y-010 | P1 | Implemented | Reduced-motion preference suppresses non-essential movement and animation. | 11 |
| A11Y-011 | P0 | Partial | Parse-job completion/failure, uploads, validation summaries and other asynchronous status changes are announced to screen readers. | 11 |
| A11Y-012 | P0 | Partial | Browser zoom/reflow and text resizing do not obscure content or require two-dimensional scrolling in normal page content. | 11 |
| A11Y-013 | P1 | Implemented | Embedded PDF viewer has an accessible title plus equivalent open/download fallback; the viewer is not the only access route. | 6.7, 11 |
| A11Y-014 | P0 | Planned | Manual QA covers current Safari/VoiceOver, Chromium/keyboard and at least one mobile screen-reader/keyboard path agreed in the browser matrix. | 11, 16 |

## 8. SEO and analytics

**Evidence:** Canonicals, Open Graph metadata/social image, robots, published-only sitemap, article JSON-LD, branded 404 and published-only internal search are implemented. Analytics and consent are absent. Some page/detail titles already include “| M&A Watch” while the root metadata template appends it, and report social metadata does not provide a report-specific image.

| ID | Pri | Status | Acceptance check | Spec |
|---|---:|---|---|---|
| SEO-001 | P1 | Implemented | Public pages use human-readable stable URLs and publication slugs remain unique. | 5.2, 10.2 |
| SEO-002 | P1 | Partial | Public page titles/descriptions are useful and editable where required; no starter metadata remains. | 6.1, 10.2 |
| SEO-003 | P1 | Implemented | Canonical URLs are correct for public pages and absent/made non-indexable for private previews/admin routes. | 10.2 |
| SEO-004 | P1 | Partial | Public pages provide site-specific Open Graph/social metadata and images; report metadata reflects the report. | 6.1, 6.4, 10.2 |
| SEO-005 | P1 | Implemented | XML sitemap contains only indexable public pages and Published publications. | 10.2 |
| SEO-006 | P0 | Implemented | Robots directives prevent indexing of admin, preview, draft, scheduled, archived and private file URLs. | 10.1, 10.2 |
| SEO-007 | P1 | Partial | Strategic and Legal pages expose valid structured article metadata. | 10.2 |
| SEO-008 | P1 | Implemented | A useful branded 404 page handles unknown and unavailable public slugs without revealing record state. | 10.2 |
| SEO-009 | P0 | Implemented | Internal search indexes only Published titles, summaries, authors/chapters and approved web text; Markets PDF body is excluded in MVP. | 10.1 |
| SEO-010 | P1 | Planned | Analytics records page views, listing search/filter use, report views and PDF view/download events. | 10.3 |
| SEO-011 | P1 | Planned | Analytics records application-page views, successful submissions and validation failures without sensitive fields/CV data. | 10.3, 13.2 |
| SEO-012 | P0 | Needs external setup | Analytics provider and consent/privacy mode are approved and configured for staging/production. | 10.3, 16 |
| SEO-013 | P2 | Needs external setup | Stakeholders supply any old URLs that warrant manual redirects; only approved mappings are implemented. | 10.2, 16 |

## 9. Performance and reliability

**Evidence:** The code has framework optimisation for bundled images, validated delivery of original managed article images, a D1 job outbox, atomic claims, leases, retries, provider idempotency keys, scheduler catch-up, health/maintenance endpoints, dashboard failure visibility, CI and an operations runbook. Managed uploads do not yet create resized/optimised derivatives, so REL-002 remains Partial. Providers, triggers, monitoring, backups and restoration remain unprovisioned. Tests cover retry arithmetic and maintenance-token comparison, not real job/database/file integration or outage recovery.

| ID | Pri | Status | Acceptance check | Spec |
|---|---:|---|---|---|
| REL-001 | P1 | Planned | Public pages target Core Web Vitals “good” at the 75th percentile on typical mobile connections, excluding third-party PDF viewer limits. | 12 |
| REL-002 | P1 | Partial | Uploaded images are resized/optimised for delivery while required originals are preserved. | 12 |
| REL-003 | P1 | Partial | Large parsed reports remain navigable and responsive and do not block the main page request. | 12 |
| REL-004 | P0 | Partial | Parsing and email delivery execute outside interactive requests with retry, idempotency and observable job status. | 7.4, 9.3, 12 |
| REL-005 | P0 | Partial | Job retries cannot duplicate publications, applications or outbound emails. | 12, 14 |
| REL-006 | P0 | Partial | Scheduler catches up safely after outage and publishes due content once using timezone-safe values. | 7.3, 12, 14 |
| REL-007 | P0 | Needs external setup | Automated database and file backups have an approved retention schedule and alerting. | 12 |
| REL-008 | P0 | Needs external setup | A restoration runbook exists and a production-like database/file restoration test is completed and recorded before launch. | 12, 15.5, 18 |
| REL-009 | P0 | Needs external setup | Runtime error and failed-job monitoring is configured with an owned notification channel and escalation path. | 12, 15.5 |
| REL-010 | P1 | Implemented | Email delivery failures are retained with actionable status in admin without exposing recipient data unnecessarily. | 9.3 |
| REL-011 | P0 | Partial | Automated end-to-end tests cover publish visibility, parsing/manual review, Markets no-parse, application idempotency/closure and RBAC. | 15, 18 |
| REL-012 | P0 | Partial | Edge-case tests cover corrupt/encrypted/image-only PDFs, unsupported formatting, warning/failure states, malicious/oversize CVs and duplicate slugs/emails. | 14 |
| REL-013 | P1 | Implemented | Empty publication collections and no-result filters render intentional states without errors. | 6.3, 14 |
| REL-014 | P0 | Needs external setup | Hosting, database, private object storage, background-job/scheduling and email-provider production resources are selected and provisioned. | 12, 16 |

## 10. Launch readiness

**Evidence:** The pre-editor full local verification run passed, the starter is removed and operational/environment documentation exists. The current editor/preview/image waves await the senior's final freeze verification. The worktree is not yet a clean committed checkout, no production-like environment has been exercised, and no browser/accessibility/security/content/operational acceptance sign-off exists.

| ID | Pri | Status | Acceptance check | Spec |
|---|---:|---|---|---|
| LCH-001 | P0 | Implemented | Disposable starter screen, preview metadata, starter icons/tests and unused skeleton dependency are removed before release. | Product baseline |
| LCH-002 | P0 | Partial | Production build, migrations and product test suite complete successfully from a clean checkout. | 18 |
| LCH-003 | P0 | Needs external setup | A staging environment exercises production-equivalent identity, database, private storage, email, scheduler and scanning integrations. | 15, 18 |
| LCH-004 | P0 | Planned | All required public and admin routes pass the acceptance checks in this register on agreed mobile and desktop browsers. | 15.1, 18 |
| LCH-005 | P0 | Needs external setup | Supported browser/version matrix is approved. | 16 |
| LCH-006 | P0 | Needs external setup | Hosting/deployment provider, public domain and DNS ownership are confirmed. | 16 |
| LCH-007 | P0 | Needs external setup | Database, file storage, authentication, email, analytics and monitoring provider choices and budgets are approved. | 16 |
| LCH-008 | P0 | Partial | Database migrations, environment configuration and initial Super User bootstrap are documented and repeatable without exposing secrets. | 7.10, 8, 18 |
| LCH-009 | P0 | Partial | Representative Strategic and Legal test set covers every promised parser element; use rights and expected outputs are confirmed. | 7.5, 16, 18 |
| LCH-010 | P0 | Planned | Every supplied parser fixture has reviewed expected output and passes parser acceptance, warning and failure tests. | 15.2, 18 |
| LCH-011 | P1 | Needs external setup | Final brand palette, logo usage, open-licensed webfont substitutes and imagery direction are approved. | 16 |
| LCH-012 | P1 | Needs external setup | Launch homepage, Info, application, footer, legal and accessibility content is populated or placeholders are explicitly approved. | 6, 16, 18 |
| LCH-013 | P1 | Needs external setup | Launch team data/photos, partner logos and publication metadata are supplied and approved. | 6.2, 6.10, 16, 18 |
| LCH-014 | P0 | Planned | Accessibility audit has no unresolved critical/serious defects; any accepted exceptions have owner and remediation date. | 11, 15.5, 18 |
| LCH-015 | P0 | Planned | Security/privacy review verifies RBAC, session invalidation, private files, upload scanning, rate limits, audit integrity and data minimisation. | 13, 15.4, 15.5, 18 |
| LCH-016 | P0 | Needs external setup | Applicant retention/deletion decision and approved privacy/legal wording are published before applications open. | 13.2, 16, 18 |
| LCH-017 | P0 | Needs external setup | Backup restoration evidence, scheduler recovery and job/email failure monitoring are reviewed by the launch owner. | 12, 15.5, 18 |
| LCH-018 | P1 | Planned | Analytics/consent events are verified in production-like testing without sensitive payloads. | 10.3, 15.5 |
| LCH-019 | P1 | Needs external setup | Any required old-URL redirects are supplied, implemented and smoke-tested. | 10.2, 16 |
| LCH-020 | P0 | Partial | No test applicants, private CVs, secrets, draft files or unintended sample assets are publicly reachable in the release artifact. | 13.2, 18 |
| LCH-021 | P0 | Planned | An authorised M&A Watch user completes an operational acceptance run: upload/edit/review/publish, Markets upload, application open/submit/review/close, team/content edit and account administration. | 2, 15, 18 |
| LCH-022 | P0 | Needs external setup | Product owner signs off all P0 items and explicitly records any P1 waiver; ownership for post-launch support and incidents is assigned. | 18 |

## Product QA decision

**Decision:** **GO for internal/stakeholder demonstration and continued staging work after final freeze verification; NO-GO for a public production launch or live application intake.** The codebase is a substantial, coherent MVP implementation rather than a starter, and its most recent full build/test baseline is healthy. Production acceptance is blocked by parser fidelity, privacy operations, third-party services and production-like end-to-end evidence; managed article images and exact private preview are now implemented in code.

### Status summary

| Priority | Implemented | Partial | Planned | Needs external setup | Total |
|---|---:|---:|---:|---:|---:|
| P0 | 53 | 61 | 9 | 21 | 144 |
| P1 | 27 | 18 | 4 | 7 | 56 |
| P2 | 1 | 2 | 1 | 3 | 7 |
| **All** | **81** | **81** | **14** | **31** | **207** |

“Implemented” in this summary means direct repository evidence, not production acceptance. Every item still requires the environment-level exercise described at the start of this register.

### Ordered production blockers

1. **Complete the publishing promise.** Connect a real PDF extraction adapter and establish reviewed golden outputs for all five representative reports. The structured block editor, managed image boundary, exact private preview, Review-state enforcement, parser race guard and retained candidate revisions are now implemented in code, but still need browser and D1/R2 integration coverage.
2. **Make applicant handling launch-safe.** Implement the approved applicant/CV retention and deletion process; complete legal/privacy approval; connect and test malware scanning and transactional email; and approve the sender, recipient list, recruitment copy and `hello@mawatch.org` contact used by the queued templates.
3. **Provision and prove the platform.** Create production-equivalent D1/R2 resources, hosting identity/access policy, initial Super User, MFA/session policy, email/scanning/parser providers, scheduled trigger, monitoring, analytics/consent, backups/restoration, domain/DNS and owned incident routes. The code boundaries and runbook exist; the services and acceptance evidence do not.
4. **Close security and workflow evidence gaps.** Add real D1/R2 route tests for the RBAC matrix, disabled users, final-Super-User concurrency, private CV/source access, publish/schedule transitions, parser retry/race recovery, application closure/idempotency and job/email outage recovery. Complete security/privacy review before any CV is accepted.
5. **Complete user-facing acceptance.** Run the agreed desktop/mobile browser matrix, WCAG 2.2 AA automated and manual checks, keyboard/VoiceOver paths, zoom/reflow, performance and visual QA. Resolve the public team-photo dead path, missing social/contact management, narrow Info/homepage CMS coverage, title/social-image gaps and any defects found.
6. **Control launch content.** Replace or explicitly approve demonstration publications, unrelated placeholder report PDFs, team/contact/legal copy and sample assets. The current database-error fallback can reintroduce hard-coded demonstration publications, so production should fail closed or use an explicitly approved release-mode dataset.

### Re-evaluation threshold

Change the production decision to **GO** only after every P0 is Implemented or has documented environment-level acceptance, all external P0 setup is complete, no critical/serious accessibility or security defects remain, and the product owner records any P1 waiver plus operational ownership.
