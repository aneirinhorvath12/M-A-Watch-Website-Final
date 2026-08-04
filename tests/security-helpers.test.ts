import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanPlainText,
  hasSafeRequestOrigin,
  inspectPdf,
  normalisePublicationPdfFilename,
  readBoundedMultipartForm,
} from "../lib/security-helpers";

function pdfFile(body: string, type = "application/pdf") {
  return new File([body], "report.pdf", { type });
}

test("request origin checks fail closed for cross-origin and malformed values", () => {
  assert.equal(
    hasSafeRequestOrigin(
      new Request("https://mawatch.org/api/applications"),
    ),
    false,
  );
  assert.equal(
    hasSafeRequestOrigin(
      new Request("https://mawatch.org/api/applications", {
        headers: {
          origin: "https://mawatch.org",
          "sec-fetch-site": "cross-site",
        },
      }),
    ),
    false,
  );
  assert.equal(
    hasSafeRequestOrigin(
      new Request("https://mawatch.org/api/applications", {
        headers: { origin: "https://mawatch.org" },
      }),
    ),
    true,
  );
  assert.equal(
    hasSafeRequestOrigin(
      new Request("https://mawatch.org/api/applications", {
        headers: { origin: "https://attacker.example" },
      }),
    ),
    false,
  );
  assert.equal(
    hasSafeRequestOrigin(
      new Request("https://mawatch.org/api/applications", {
        headers: { origin: "not a url" },
      }),
    ),
    false,
  );
});

test("PDF inspection checks MIME, signature, size and active content", async () => {
  assert.equal((await inspectPdf(pdfFile("%PDF-1.7\nbody"), 1_000)).ok, true);
  assert.equal((await inspectPdf(pdfFile("not pdf"), 1_000)).ok, false);
  assert.equal((await inspectPdf(pdfFile("%PDF-1.7", "text/plain"), 1_000)).ok, false);
  assert.equal((await inspectPdf(pdfFile("%PDF-1.7\n/JavaScript"), 1_000)).ok, false);
  assert.equal((await inspectPdf(pdfFile("%PDF-1.7\nbody"), 4)).ok, false);
});

test("plain text cleaning removes markup and normalises whitespace", () => {
  assert.equal(cleanPlainText("  <b>Ada</b>\n Lovelace  ", 40), "Ada Lovelace");
  assert.equal(cleanPlainText("abcdefgh", 4), "abcd");
  assert.equal(cleanPlainText(null, 10), "");
});

test("bounded multipart reading preserves the generated boundary and file", async () => {
  const source = new FormData();
  source.set("title", "Bounded report");
  source.set("sourcePdf", pdfFile("%PDF-1.7\nbody"));
  const result = await readBoundedMultipartForm(
    new Request("https://mawatch.org/api/admin/publications", {
      method: "POST",
      body: source,
    }),
    {
      maxBytes: 2_048,
      invalidMessage: "Unreadable upload.",
      tooLargeMessage: "Upload too large.",
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.form.get("title"), "Bounded report");
  const uploaded = result.form.get("sourcePdf");
  assert.equal(uploaded instanceof File, true);
  assert.equal((uploaded as File).name, "report.pdf");
});

test("bounded multipart reading cancels and unlocks oversized streams with missing or false lengths", async () => {
  for (const contentLength of [undefined, "1"] as const) {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(9));
      },
      cancel() {
        cancelled = true;
      },
    });
    const headers = new Headers({
      "content-type": "multipart/form-data; boundary=upload",
    });
    if (contentLength) headers.set("content-length", contentLength);
    const request = streamingRequest(body, headers);
    const result = await readBoundedMultipartForm(request, {
      maxBytes: 8,
      invalidMessage: "Unreadable upload.",
      tooLargeMessage: "Upload too large.",
    });
    assert.deepEqual(result, {
      ok: false,
      error: "Upload too large.",
      status: 413,
    });
    assert.equal(cancelled, true);
    assert.equal(body.locked, false);
  }
});

test("bounded multipart reading rejects malformed and mismatched Content-Length values", async () => {
  const malformedBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  const malformed = await readBoundedMultipartForm(
    streamingRequest(
      malformedBody,
      new Headers({
        "content-type": "multipart/form-data; boundary=upload",
        "content-length": "not-a-number",
      }),
    ),
    {
      maxBytes: 8,
      invalidMessage: "Unreadable upload.",
      tooLargeMessage: "Upload too large.",
    },
  );
  assert.equal(malformed.ok ? 0 : malformed.status, 400);
  assert.equal(malformedBody.locked, false);

  const mismatchedBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(2));
      controller.close();
    },
  });
  const mismatched = await readBoundedMultipartForm(
    streamingRequest(
      mismatchedBody,
      new Headers({
        "content-type": "multipart/form-data; boundary=upload",
        "content-length": "1",
      }),
    ),
    {
      maxBytes: 8,
      invalidMessage: "Unreadable upload.",
      tooLargeMessage: "Upload too large.",
    },
  );
  assert.equal(mismatched.ok ? 0 : mismatched.status, 400);
  assert.equal(mismatchedBody.locked, false);
});

test("publication source filenames are safe, bounded and always end in .pdf", () => {
  assert.equal(normalisePublicationPdfFilename("quarterly-report"), "quarterly-report.pdf");
  assert.equal(normalisePublicationPdfFilename("../deal deck.PDF"), "_deal_deck.pdf");
  assert.equal(normalisePublicationPdfFilename("..."), "source.pdf");
  const bounded = normalisePublicationPdfFilename("a".repeat(300));
  assert.equal(bounded.length, 140);
  assert.match(bounded, /\.pdf$/);
});

function streamingRequest(
  body: ReadableStream<Uint8Array>,
  headers: Headers,
): Request {
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers,
    body,
    duplex: "half",
  };
  return new Request("https://mawatch.org/upload", init);
}
