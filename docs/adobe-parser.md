# Adobe PDF Extract adapter

The repository contains a credential-free, testable Adobe adapter in
`lib/parser/adobe`. It implements Adobe's server-side REST flow as an
asynchronous state machine rather than trying to finish a machine-learning PDF
job inside one M&A Watch request.

## Configuration contract

Provide all three values as encrypted Worker secrets/configuration. The custom
`PARSER_WEBHOOK_URL` adapter takes precedence only when both its HTTPS endpoint
and bearer token are valid. A partial or insecure webhook configuration never
shadows complete Adobe credentials:

```dotenv
ADOBE_PDF_SERVICES_CLIENT_ID=
ADOBE_PDF_SERVICES_CLIENT_SECRET=
ADOBE_PDF_SERVICES_REGION=eu
```

`ADOBE_PDF_SERVICES_REGION` must be exactly `eu` or `us`; it has no implicit
default because the source reports are private. Authentication uses Adobe's
documented global `https://pdf-services.adobe.io/token` endpoint. Assets and
operations use the selected regional host. Upload and download URLs are
accepted only from Adobe's documented regional storage hostname, preventing a
provider response from becoming an SSRF primitive.

Keep the client secret server-side. Never expose these values through a public
Next.js variable, browser bundle, job error, audit metadata or parser result.

## Async flow

`startAdobeExtractJob` performs only these bounded steps:

1. Exchange the service-principal credentials for a short-lived access token.
2. Create an Adobe asset and validate the returned pre-signed upload host.
3. upload the clean PDF;
4. submit an Extract job for styled text and table structure; and
5. return serialisable polling state.

The polling state contains an Adobe asset ID, the regional status URL,
submission time, poll count and `notBefore`. It deliberately contains no access
token or pre-signed upload/download URL.

`pollAdobeExtractJob` checks `notBefore`, obtains a fresh token and performs at
most one status request. `in progress` returns a new pending state using
Adobe's bounded `Retry-After` value. `done` downloads the separate `content`
JSON asset and the bounded `resource` ZIP, extracts only allowlisted figure PNG
paths, maps the source to `PrototypeExtraction`, and returns the Adobe
schema-derived parser version. A job fails closed after 120 polls or six hours.

Adobe's REST and SDK material use both `downloadUri` and `downloadURI` casing.
The adapter accepts either spelling but rejects responses containing neither or
both. The official Node SDK distinguishes the JSON `content` asset from the ZIP
`resource` asset; its `ExtractPDFResult.contentJSON` is the parsed structured
content while `resource` is the archive.

No part of completion publishes a report. `adobeCompletionToParserResult`
passes the mapped extraction through the shared deterministic parser validator,
which can create only a Draft or Parse Failed result.

## Durable job-runner integration

The direct adapter is wired as a `publication_parse` provider with a pending
outcome; the synchronous custom webhook remains an override:

1. The stored parse payload can carry an optional
   `adobeState: AdobeExtractJobState`.
2. When Adobe credentials are complete and the payload has no state, the runner
   loads the clean R2 source and calls `startAdobeExtractJob`.
3. On `pending`, the runner persists state back into the same job payload, sets
   `status='queued'`, and sets `run_after` to `state.notBefore`.
4. Because the job claim increments `attempts`, a normal Adobe pending
   transition compensates in the same update so provider processing time does
   not burn the five-failure budget:

   ```sql
   UPDATE background_jobs
   SET status = 'queued', payload = ?,
       attempts = CASE WHEN attempts > 0 THEN attempts - 1 ELSE 0 END,
       run_after = ?, error = NULL, claim_token = NULL, updated_at = ?
   WHERE id = ? AND status = 'running' AND claim_token = ?
   ```

5. When a persisted state is due, the runner calls `pollAdobeExtractJob`
   without re-uploading the source merely to observe status.
6. On `complete`, it range-reads only the original R2 signature plus immutable
   object metadata, constructs the existing signature-validating `ParserInput`, calls
   `adobeCompletionToParserResult`, then uses the existing
   `finishPublicationParse` race guard and candidate-revision path.
7. Adobe `failed` results and non-retryable adapter errors are permanent.
   The persisted `adobeState` survives transient network, 429 and 5xx failures so the
   existing retry schedule resumes the same remote job.

There is one narrow distributed-systems gap during initial submission: Adobe
does not document an idempotency key for Extract submission. If a Worker loses
its response after Adobe accepts the job but before D1 stores its polling URL, a
retry may submit a second paid transaction. Do not claim exactly-once remote
submission. Monitor transaction counts; an idempotent provider facade or
durable orchestration layer is the stronger future mitigation.

## Mapping and fail-closed behaviour

The mapper supports source-backed headings, paragraphs, styled inline text,
safe links, lists, explicit rectangular tables and reference sections. Adobe
does not provide block confidence in its public Extract schema, so mapped
blocks use `0.79`; the shared parser deliberately turns that into visible
low-confidence editorial warnings.

The mapper rejects an unapproved Adobe schema, invalid page sequence, elements
outside the page range, oversized response, duplicate table coordinates,
incomplete grids and tables without an explicit accessible header row. Merged
cells and row headers cannot be represented by the current `ArticleBlock`
table shape, so they become editorial unsupported-structure warnings rather
than guessed data.

Figure renditions are requested explicitly. The adapter accepts only bounded
PNG entries under the archive's `figures/` directory, validates their signature
and dimensions, and stores them under deterministic job-scoped private R2 keys
so retries are idempotent without colliding with replacement jobs. Images not
present in the final validated Draft result are deleted. The mapper creates
managed image blocks with blank alternative
text. This preserves the source figure while keeping publication locked until
an editor supplies a human-written description. Ambiguous or missing rendition
paths remain explicit editorial warnings rather than guessed images.

## Launch verification still requiring credentials

- Run all five immutable report fixtures through the live EU account.
- Record reviewed golden adapter output; Adobe notes that its ML inference can
  vary as models improve even when the JSON structure remains compatible.
- Manually review page-spanning prose, dense figures, tables and references.
- Confirm quota, pricing and alert thresholds for the expected report volume.
- Exercise 429, 5xx, expired-job and Worker-restart recovery against D1/R2.
- Confirm Adobe's data-processing terms and the selected processing region with
  the M&A Watch team.

## Official references

- [Adobe Extract REST getting started](https://developer.adobe.com/document-services/docs/overview/pdf-extract-api/gettingstarted)
- [Adobe Extract output and reading-order format](https://developer.adobe.com/document-services/docs/overview/legacy-documentation/pdf-extract-api/howtos/extract-api)
- [Adobe Extract JSON schema 1.1.0](https://raw.githubusercontent.com/AdobeDocs/pdfservices-api-documentation/main/static/extract-json-output-schema2.json)
- [Adobe Node SDK `ExtractPDFResult`](https://opensource.adobe.com/pdfservices-node-sdk-samples/apidocs/latest/classes/ExtractPDFResult.html)
- [Adobe asset and pre-signed URL expiry](https://developer.adobe.com/document-services/docs/overview/pdf-services-api/howtos/sdk-utilities)
- [Cloudflare Worker limits and streaming guidance](https://developers.cloudflare.com/workers/platform/limits/)
