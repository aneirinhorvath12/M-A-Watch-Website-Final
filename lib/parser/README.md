# PDF parser boundary

This directory defines the deterministic boundary between PDF extraction and the
M&A Watch publication editor. It is intentionally dependency-free: the current
prototype validates the source, orders adapter output by explicit page
coordinates, and produces editorial warnings without generating or rewriting
report prose.

## Production integration

A production extraction worker should:

1. Validate and malware-scan the PDF before invoking an extraction adapter.
2. Map observed source elements to `PrototypeExtraction`, retaining source page,
   order and confidence for every block.
3. Call `runParserPrototype` and persist both its draft blocks and warnings.
4. Require a human editor to resolve warnings, add image alternative text and
   approve the draft. The parser result must never trigger publication.
5. Preserve the source PDF and previous approved revision when a replacement is
   parsed.

`fixtures/representative-reports.ts` records all five stakeholder-supplied PDFs,
their page geometry and structures to check in parser acceptance testing.
`fixtures/golden-output.ts` locks each source by SHA-256 and byte length and
records ordered source-text anchors. `evaluateParserFixture` compares a real
adapter result with those baselines: contract/page identity, safe block shapes,
coordinates, supported structures and ordered anchors are automated, while
page-spanning text and the fixture's editorial notes remain explicit human
checks. Replacing a fixture or changing the expected output therefore requires
an intentional baseline review rather than silently weakening the suite.

The prototype fails closed when signature bytes are missing, the adapter
returns no usable content, page/block coordinates are invalid, block identities
are duplicated or inconsistent, or a block is unsafe. Those conditions produce
`parse-failed` with no candidate blocks; editorial uncertainties such as low
confidence or missing alternative text remain visible warnings on a Draft.

`adobe/` contains the direct production adapter. It uses an asynchronous,
region-explicit Adobe PDF Extract state machine; the durable job runner stores
polling state, maps structured JSON through this prototype, and converts
bounded figure renditions into private managed publication images. Extracted
figures intentionally retain blank alternative text so an editor must describe
them before review or publication.

## Visibility boundary

The public publishing services only return records with `status: published` and
`visibility: enabled`. Non-public preview access is isolated in
`lib/publications/preview.ts` and requires an active server-authenticated Admin
or Super User with the `publications:preview` permission. Query-string role
claims are not valid preview authorisation.

Demonstration publications are disabled by default. Local or preview
environments may explicitly set `PUBLICATION_CONTENT_MODE=demo`; a missing,
blank or unknown value resolves to managed D1-only content and database errors
are not replaced by seed reports.
