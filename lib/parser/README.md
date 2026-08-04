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
their page geometry and structures to check in parser acceptance testing. It is
the test manifest for a future extraction adapter; adding an adapter must not
change this contract silently.

## Visibility boundary

The public publishing services only return records with `status: published` and
`visibility: enabled`. Non-public preview access is isolated in
`lib/publications/preview.ts` and requires an active server-authenticated Admin
or Super User with the `publications:preview` permission. Query-string role
claims are not valid preview authorisation.
