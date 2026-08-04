const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000");
const sitesBypassToken = process.env.SMOKE_SITES_BYPASS_TOKEN?.trim();
const releaseMode = process.env.SMOKE_RELEASE_MODE?.trim().toLowerCase() === "true";

if (
  releaseMode &&
  (baseUrl.protocol !== "https:" || isLoopback(baseUrl.hostname))
) {
  console.error("Release acceptance requires a non-loopback HTTPS SMOKE_BASE_URL.");
  process.exit(1);
}
if (baseUrl.username || baseUrl.password || baseUrl.hash) {
  console.error("SMOKE_BASE_URL must not contain credentials or a fragment.");
  process.exit(1);
}

const publicRoutes = [
  "/",
  "/reports/strategic",
  "/reports/legal",
  "/markets",
  "/apply",
  "/team",
  "/info",
  "/privacy",
  "/retention",
  "/terms",
  "/accessibility",
  "/robots.txt",
  "/sitemap.xml",
];

const failures = [];
const responses = new Map();

for (const path of publicRoutes) {
  const response = await request(path);
  responses.set(path, response);
  if (response.status !== 200) {
    failures.push(`${path} returned HTTP ${response.status}`);
  }
}

const health = await request("/api/health");
if (health.status !== 200) {
  failures.push(`/api/health returned HTTP ${health.status}`);
} else {
  const result = await health.json().catch(() => null);
  if (result?.status !== "ready") failures.push("health response is not ready");
  if (releaseMode && result?.checks?.productionServices !== "ok") {
    failures.push("production-service readiness is not enforced");
  }
  if (!(health.headers.get("cache-control") ?? "").includes("no-store")) {
    failures.push("health response is cacheable");
  }
}

const healthHead = await request("/api/health", { method: "HEAD" });
if (healthHead.status !== 200) {
  failures.push(`/api/health HEAD returned HTTP ${healthHead.status}`);
} else if ((await healthHead.text()).length !== 0) {
  failures.push("health HEAD response contains a body");
}

const home = responses.get("/");
for (const [name, expected] of [
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
]) {
  if (home?.headers.get(name) !== expected) {
    failures.push(`homepage is missing ${name}`);
  }
}
if (!(home?.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'")) {
  failures.push("homepage framing policy is missing");
}
if (
  baseUrl.protocol === "https:" &&
  !home?.headers.has("strict-transport-security")
) {
  failures.push("HTTPS homepage is missing HSTS");
}

const robots = await responses.get("/robots.txt")?.text();
if (!robots?.includes("/admin") || !robots.includes("/preview")) {
  failures.push("robots.txt does not protect private route families");
}

const sitemap = await responses.get("/sitemap.xml")?.text();
if (sitemap?.includes("/admin") || sitemap?.includes("/preview")) {
  failures.push("sitemap contains a private route");
}

if (failures.length) {
  console.error(`Smoke acceptance failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `${releaseMode ? "Release" : "Smoke"} acceptance passed for ${baseUrl.origin} ` +
      `(${publicRoutes.length + 2} checks).`,
  );
}

async function request(path, init = {}) {
  const headers = sitesBypassToken
    ? { "oai-sites-authorization": `Bearer ${sitesBypassToken}` }
    : undefined;
  return fetch(new URL(path, baseUrl), {
    ...init,
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
}

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
