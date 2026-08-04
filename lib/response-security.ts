const BASE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy":
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

const HTTPS_CSP_SUFFIX = "; upgrade-insecure-requests";
const BASE_CONTENT_SECURITY_POLICY =
  "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'";

function isPdfViewerPage(pathname: string): boolean {
  return (
    /^\/markets\/[^/]+\/?$/.test(pathname) ||
    /^\/preview\/publications\/[^/]+\/?$/.test(pathname)
  );
}

function isSameOriginPdfResponse(response: Response, pathname: string): boolean {
  return (
    response.headers.get("content-type")?.toLowerCase().startsWith("application/pdf") ===
      true &&
    (
      /^\/api\/publications\/[^/]+\/pdf\/?$/.test(pathname) ||
      /^\/api\/files\/publications\/[^/]+\/source\/?$/.test(pathname)
    )
  );
}

/**
 * Apply headers that are safe across HTML, API and asset responses.
 *
 * This deliberately avoids script/style source directives. React server output
 * contains framework-managed inline bootstrap data, so those directives need a
 * nonce-aware implementation rather than a blanket policy that would break the
 * application. The directives below still close framing, plugin and base-URL
 * injection classes without changing rendering behaviour.
 */
export function applyResponseSecurity(
  response: Response,
  requestUrl: string | URL,
): Response {
  const url =
    typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
  const headers = new Headers(response.headers);

  const embeddablePdf = isSameOriginPdfResponse(response, url.pathname);

  for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    if (embeddablePdf && name === "x-frame-options") continue;
    if (!headers.has(name)) headers.set(name, value);
  }

  if (embeddablePdf) headers.delete("x-frame-options");

  const contentSecurityPolicy = embeddablePdf
    ? "base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'none'"
    : isPdfViewerPage(url.pathname)
      ? "base-uri 'self'; object-src 'self'; frame-ancestors 'none'; form-action 'self'"
      : BASE_CONTENT_SECURITY_POLICY;
  const csp = `${contentSecurityPolicy}${
    url.protocol === "https:" ? HTTPS_CSP_SUFFIX : ""
  }`;
  if (embeddablePdf || !headers.has("content-security-policy")) {
    headers.set("content-security-policy", csp);
  }

  if (url.protocol === "https:" && !headers.has("strict-transport-security")) {
    headers.set("strict-transport-security", "max-age=31536000");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
