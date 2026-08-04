import assert from "node:assert/strict";
import test from "node:test";
import { applyResponseSecurity } from "../lib/response-security";

test("production responses receive baseline browser security headers", async () => {
  const secured = applyResponseSecurity(
    new Response("ok", {
      headers: { "content-type": "text/plain" },
    }),
    "https://mawatch.example/reports",
  );

  assert.equal(await secured.text(), "ok");
  assert.equal(secured.headers.get("x-content-type-options"), "nosniff");
  assert.equal(secured.headers.get("x-frame-options"), "DENY");
  assert.equal(
    secured.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  assert.match(
    secured.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/,
  );
  assert.match(
    secured.headers.get("content-security-policy") ?? "",
    /upgrade-insecure-requests/,
  );
  assert.equal(
    secured.headers.get("strict-transport-security"),
    "max-age=31536000",
  );
});

test("local HTTP responses are not forced onto HTTPS", () => {
  const secured = applyResponseSecurity(
    new Response(null, { status: 204 }),
    "http://localhost:3000/api/health",
  );

  assert.equal(secured.headers.has("strict-transport-security"), false);
  assert.doesNotMatch(
    secured.headers.get("content-security-policy") ?? "",
    /upgrade-insecure-requests/,
  );
});

test("route-specific security headers are preserved", () => {
  const secured = applyResponseSecurity(
    new Response("ok", {
      headers: {
        "content-security-policy": "default-src 'none'",
        "referrer-policy": "no-referrer",
      },
    }),
    "https://mawatch.example/admin",
  );

  assert.equal(
    secured.headers.get("content-security-policy"),
    "default-src 'none'",
  );
  assert.equal(secured.headers.get("referrer-policy"), "no-referrer");
});

test("Markets and authenticated preview pages permit only same-origin PDF objects", () => {
  for (const path of [
    "/markets/example-report",
    "/preview/publications/publication_123",
  ]) {
    const secured = applyResponseSecurity(
      new Response("<html></html>", {
        headers: { "content-type": "text/html" },
      }),
      `https://mawatch.example${path}`,
    );
    assert.match(
      secured.headers.get("content-security-policy") ?? "",
      /object-src 'self'/,
    );
    assert.equal(secured.headers.get("x-frame-options"), "DENY");
  }
});

test("clean publication PDFs may be embedded only by the same origin", () => {
  for (const path of [
    "/api/publications/example-report/pdf",
    "/api/files/publications/publication_123/source",
  ]) {
    const secured = applyResponseSecurity(
      new Response("%PDF-1.7", {
        headers: {
          "content-type": "application/pdf",
          "content-security-policy": "default-src 'none'; sandbox",
          "x-frame-options": "DENY",
        },
      }),
      `https://mawatch.example${path}`,
    );
    assert.equal(secured.headers.has("x-frame-options"), false);
    assert.match(
      secured.headers.get("content-security-policy") ?? "",
      /frame-ancestors 'self'/,
    );
    assert.doesNotMatch(
      secured.headers.get("content-security-policy") ?? "",
      /frame-ancestors 'none'/,
    );
  }
});
