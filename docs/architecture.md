# M&A Watch technical architecture

## Runtime shape

The application is a single Next-compatible vinext codebase deployed as a Cloudflare Worker through OpenAI Sites. Public and administrative routes share one design system while server-side authorisation remains mandatory for every private action.

| Concern | Implementation |
|---|---|
| Public and admin UI | React server/client components and route handlers |
| Structured persistence | Cloudflare D1 (`DB`) with versioned Drizzle migrations |
| Private and public uploads | Private Cloudflare R2 (`FILES`) objects, exposed only through record-scoped routes after D1 publication, activation or reference checks |
| Administrative identity | Hosting-provided sign-in identity plus a D1 invitation/role/status allowlist |
| Authorisation | Server-side Admin/Super User guards on pages and mutations |
| Background work | Durable D1 job outbox for parsing, scanning and email delivery, claimed by a Worker maintenance runner |
| Audit | Append-only D1 audit records for security and material content/workflow actions |
| Analytics | Cookie-free, same-origin daily aggregate D1 counters behind an explicit runtime gate |

## Security boundaries

- The public site never receives bucket object keys, applicant records, drafts, parse errors or non-published search data.
- CVs are written under private random object keys and streamed only after an authorised server-side check.
- Upload validation checks size, MIME type, PDF signature and active-content indicators before quarantine. Production launch still requires a configured malware scanner.
- Multipart bodies are stream-bounded before parsing. Managed JPEG, PNG and WebP uploads receive complete structural validation, server-derived dimensions and private random object keys.
- Team photographs, publication covers, parsed/article images and Info images become anonymously readable only while their owning record is active, published or explicitly references the asset. Authenticated draft previews bypass shared image optimisation.
- Public and administrative mutations use same-origin checks, server validation, prepared SQL and request throttling.
- Administrative identity proves who signed in; D1 account state determines whether that identity is authorised and which role it has.
- Disabled accounts fail server-side access checks even if the hosting identity session remains valid.

## Publishing lifecycle

Strategic and Legal uploads enter quarantine and create an asynchronous scan job. A clean scan updates the private R2 object's metadata, moves the publication to Parsing and atomically creates one parser job. Parser output is a controlled sequence of typed blocks with explicit warnings. A revision snapshot is stored before source replacement or re-parse. Only an explicit publish action can expose a report. Markets uploads stop at Draft after a clean scan and never enqueue a parser job.

Scheduled publication timestamps are stored as UTC milliseconds. Editorial forms display and interpret them in `Europe/London`. A recoverable job runner promotes due scheduled items with a conditional state transition and records one audit event. The runner is exposed through both the Worker's scheduled-event handler and a bearer-protected maintenance endpoint; the production trigger is an operational configuration task.

## Recruitment lifecycle

The public form re-checks the open/closed setting at submission time. A stable submission key prevents accidental duplicates. CV bytes are stored before the metadata transaction and removed again if that transaction fails. The applicant row, initial status history, scan job and required email outbox rows are committed in one D1 batch. Delivery happens later, so an integration outage does not erase a valid application and a request retry cannot create a second set of messages.

## Job reliability model

Only a runner that atomically changes a due job from Queued to Running may call a provider. Each claim receives a random fencing token. Every D1 completion, retry and record-side effect must still match that token, so an expired worker cannot overwrite a replacement worker. Running jobs have a five-minute lease and are re-queued after an interrupted Worker execution. Failures retry with bounded exponential backoff and become Failed after five attempts; permanent validation or malware results fail immediately. Every provider request carries a stable `Idempotency-Key` derived from the job type and identifier. Exactly-once external delivery still depends on the selected provider honouring that key.

File-scan and parser completion apply only when the record still points to the same random R2 key, preventing a late job for a replaced source from overwriting the current revision. Parser output is always retained as a system candidate revision. It is applied to the current record only when the source key, Parsing state, expected update timestamp and empty body still match; concurrent editorial changes are preserved. A clean scan is recorded in both the durable job state and R2 custom metadata. Private downloads require both signals.

An authorised editor can explicitly apply any retained revision from the private revision history. The mutation re-validates the selected block body and warning payload, snapshots the current body, then atomically restores the selected content to Draft, rebuilds bounded visible search text and records both revision identifiers and the actor in the audit log. Revision bodies are never returned by a public route.

Parser bodies are fully shape-validated and capped at 750 KB by UTF-8 bytes. Warnings, metadata and normalised visible-text search each have smaller independent caps, keeping every D1 row comfortably below the platform's 2 MB row limit. Search text never duplicates raw article JSON.

## Editorial content and media

Homepage sections, Info blocks and footer contact/social content use saved draft
and published D1 values with authenticated, no-store previews. Info supports only
controlled headings, paragraphs, safe links, calls to action and validated
managed images. Team members and publication covers use structured metadata and
server-derived image dimensions; public routes verify the current D1 reference
before reading private R2 objects. Public managed images use the platform image
transformer with short revalidation, while private previews are unoptimised so
authenticated bytes cannot enter a shared cache.

## Privacy-preserving analytics

When `ANALYTICS_ENABLED=true`, the browser sends only an allowlisted event name
and one low-cardinality dimension to a same-origin endpoint. The server never
stores raw paths, query strings, search terms, IP addresses, user agents,
referrers, visitor identifiers, applicant identifiers or form values. Counts
are aggregated by UTC day and automatically pruned after 400 days.

## External launch dependencies

The codebase keeps provider-specific delivery behind durable jobs, but production still needs:

1. A transactional email provider and verified sender.
2. A malware scanning service for PDFs and CVs.
3. Approved retention and deletion policy plus legal/privacy copy.
4. Production access policy, initial Super User and MFA enforcement.
5. Monitoring, analytics consent configuration and tested backup restoration.

These are operational launch gates, not values that should be committed to source control.
