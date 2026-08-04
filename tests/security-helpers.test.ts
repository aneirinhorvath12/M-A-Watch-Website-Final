import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanPlainText,
  hasSafeRequestOrigin,
  inspectPdf,
} from "../lib/security-helpers";

function pdfFile(body: string, type = "application/pdf") {
  return new File([body], "report.pdf", { type });
}

test("request origin checks fail closed for cross-origin and malformed values", () => {
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
