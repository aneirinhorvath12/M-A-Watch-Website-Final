// Exercises the built Worker through Wrangler's actual asset router, D1 and R2.
// All identities and data are local test fixtures. No production service is used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getPlatformProxy } from "wrangler";

const scratch = await mkdtemp(join(tmpdir(), "ma-watch-runtime-"));
const state = join(scratch, "state");
const built = JSON.parse(await readFile("dist/server/wrangler.json", "utf8"));
const configPath = join(scratch, "wrangler.json");
const config = {
  ...built,
  name: "ma-watch-runtime-tests",
  main: resolve("dist/server", built.main),
  assets: { ...built.assets, directory: resolve("dist/server", built.assets.directory) },
  vars: {
    REQUIRE_PRODUCTION_SERVICES: "false",
    PUBLICATION_CONTENT_MODE: "managed",
    APPLICATION_INTAKE_ENABLED: "false",
    ANALYTICS_ENABLED: "false",
    MAINTENANCE_TOKEN: "local-runtime-test-only",
  },
};
await writeFile(configPath, JSON.stringify(config));
const proxyConfig = join(scratch, "bindings.json");
await writeFile(proxyConfig, JSON.stringify({
  name: "ma-watch-runtime-bindings", compatibility_date: built.compatibility_date,
  d1_databases: built.d1_databases, r2_buckets: built.r2_buckets,
}));
let proxy;
let child;
let output = "";
let checks = 0;
function check(condition, description) {
  assert.ok(condition, description);
  console.log(`PASS ${description}`);
  checks++;
}
async function stop() {
  if (child && child.exitCode === null) {
    const stopped = once(child, "exit");
    child.kill("SIGTERM");
    const timer = setTimeout(() => child?.kill("SIGKILL"), 5_000);
    await stopped;
    clearTimeout(timer);
  }
  child = undefined;
}
async function start(mode = "managed") {
  config.vars.PUBLICATION_CONTENT_MODE = mode;
  await writeFile(configPath, JSON.stringify(config));
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((done) => socket.close(done));
  output = "";
  child = spawn(process.execPath, [resolve("node_modules/wrangler/bin/wrangler.js"), "dev", "--config", configPath, "--local", "--ip", "127.0.0.1", "--port", String(port), "--persist-to", state], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: join(scratch, "wrangler.log"), BROWSER: "none" },
  });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output = (output + chunk).slice(-30_000); });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 160; i++) {
    if (child.exitCode !== null) throw new Error(output);
    try { await fetch(base + "/api/health"); return base; } catch { await delay(250); }
  }
  throw new Error(`Runtime did not start: ${output}`);
}

try {
  let base = await start();
  check((await fetch(base + "/api/health")).status === 503, "unmigrated database fails readiness");
  check((await fetch(base + "/api/health", { method: "HEAD" })).status === 503, "HEAD readiness also rejects missing schema");
  await stop();
  proxy = await getPlatformProxy({ configPath: proxyConfig, persist: { path: join(state, "v3") } });
  const db = proxy.env.DB;
  for (const file of (await readdir("drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    // Migration delimiters keep triggers intact; D1 batch runs each migration atomically.
    const statements = (await readFile(join("drizzle", file), "utf8")).split("--> statement-breakpoint").map((sql) => sql.trim()).filter(Boolean);
    await db.batch(statements.map((sql) => db.prepare(sql)));
  }
  const now = Date.now();
  await db.prepare("INSERT INTO admin_users (id,external_user_id,name,email,role,status,last_login_at,created_at,updated_at) VALUES ('runtime-admin','runtime-admin','Runtime test','runtime@example.test','super_user','active',?,?,?)").bind(now, now, now).run();
  base = await start();
  async function request(path, { method = "GET", json, body, authenticated = true } = {}) {
    const headers = authenticated ? { "oai-authenticated-user-id": "runtime-admin", "oai-authenticated-user-email": "runtime@example.test" } : {};
    if (method !== "GET") headers.origin = base;
    if (json) { headers["content-type"] = "application/json"; body = JSON.stringify(json); }
    return fetch(base + path, { method, body, headers, redirect: "manual" });
  }
  check((await fetch(base + "/api/health")).status === 200, "migrated database passes readiness");
  check((await fetch(base + "/sample-reports/amd-zt-systems.pdf")).status === 404, "real static router blocks demo PDFs in managed mode");
  check((await request("/api/admin/users", { authenticated: false })).status === 401, "anonymous admin request remains denied");
  const pdf = await readFile("public/sample-reports/amd-zt-systems.pdf");
  const upload = new FormData();
  for (const [key, value] of Object.entries({ type: "legal", title: "Runtime report", slug: "runtime-report", publicationDate: "2026-10-03" })) upload.set(key, value);
  upload.set("sourcePdf", new File([pdf], "runtime.pdf", { type: "application/pdf" }));
  const created = await request("/api/admin/publications", { method: "POST", body: upload });
  check(created.status === 201, "publication upload stores source in local R2");
  const id = (await created.json()).id;
  const path = `/api/admin/publications/${id}`;
  const publication = async () => (await (await request(path)).json()).publication;
  async function patch(payload, expected = 200) {
    const current = await publication();
    const response = await request(path, { method: "PATCH", json: { expectedVersion: current.edit_version, ...payload } });
    assert.equal(response.status, expected, await response.clone().text());
    return response.json();
  }
  const current = await publication();
  const source = await proxy.env.FILES.get(current.source_pdf_key);
  await proxy.env.FILES.put(current.source_pdf_key, await source.arrayBuffer(), { httpMetadata: { contentType: "application/pdf" }, customMetadata: { ...source.customMetadata, scanStatus: "clean" } });
  await db.prepare("UPDATE background_jobs SET status = 'succeeded' WHERE json_extract(payload, '$.publicationId') = ?").bind(id).run();
  await db.prepare("UPDATE publications SET status = 'draft' WHERE id = ?").bind(id).run();
  const body = (text) => JSON.stringify([{ id: "intro", type: "paragraph", content: [{ text }] }]);
  await patch({ intent: "save", webBody: body("Original body") });
  const stale = await publication();
  await patch({ intent: "save", title: "Editor A title" });
  await patch({ intent: "save", title: "Stale title", expectedVersion: stale.edit_version }, 409);
  check((await publication()).title === "Editor A title", "stale publication writer cannot overwrite newer metadata");
  check((await request(path, { method: "PATCH", json: { intent: "save", title: "Missing revision" } })).status === 409, "missing version cannot bypass conflict checks");
  await patch({ intent: "review" });
  await patch({ intent: "save", webBody: body("Changed after review") });
  check((await publication()).status === "draft", "reviewed body edits return to Draft");
  await patch({ intent: "publish" }, 409);
  await patch({ intent: "review" });
  const future = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 16);
  await patch({ intent: "schedule", scheduledAt: future });
  await patch({ intent: "save", webBody: body("Changed after scheduling") });
  const edited = await publication();
  check(edited.status === "draft" && edited.scheduled_at === null, "scheduled body edits clear the schedule");
  const maintenance = await fetch(base + "/api/maintenance", { method: "POST", headers: { authorization: "Bearer local-runtime-test-only" } });
  check(maintenance.status === 200 && (await publication()).status === "draft", "maintenance does not publish invalidated content");
  await patch({ intent: "review" });
  await patch({ intent: "publish" });
  check((await fetch(base + "/reports/legal/runtime-report")).status === 200, "freshly reviewed content still publishes");
  const publicPdf = await fetch(base + "/api/publications/runtime-report/pdf");
  check(publicPdf.status === 200 && Buffer.from(await publicPdf.arrayBuffer()).equals(pdf), "published source bytes match the uploaded PDF");
  // Cover and revision actions must share the same client revision contract.
  const beforeCover = await publication();
  const cover = new FormData();
  cover.set("expectedVersion", String(beforeCover.edit_version));
  cover.set("alt", "Test cover");
  cover.set("cover", new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")], "cover.png", { type: "image/png" }));
  const coverResponse = await request(path + "/cover", { method: "POST", body: cover });
  check(coverResponse.status === 201 && (await coverResponse.json()).version === (await publication()).edit_version, "cover saves return the new persisted revision");
  check((await request(path + "/cover", { method: "DELETE", json: { expectedVersion: beforeCover.edit_version } })).status === 409, "stale cover removal is rejected");
  check((await request(path + "/cover", { method: "DELETE", json: { expectedVersion: (await publication()).edit_version } })).status === 200, "current cover removal succeeds");
  const revision = await db.prepare("SELECT id FROM publication_revisions WHERE publication_id = ? AND web_body != '[]' ORDER BY revision_number ASC LIMIT 1").bind(id).first();
  const applied = await request(path + "/revisions/" + revision.id, { method: "POST", json: { confirmApply: "true", expectedVersion: (await publication()).edit_version } });
  const appliedResult = await applied.json();
  check(applied.status === 200 && appliedResult.resetBody.includes("Original body") && (await publication()).status === "draft", "applying a revision restores its body and returns to Draft");
  const replacement = new FormData();
  replacement.set("confirmReplace", "true");
  replacement.set("expectedVersion", String(beforeCover.edit_version));
  replacement.set("sourcePdf", new File([pdf], "replacement.pdf", { type: "application/pdf" }));
  check((await request(path, { method: "PATCH", body: replacement })).status === 409, "stale source replacement is rejected");
  replacement.set("expectedVersion", String((await publication()).edit_version));
  const replaced = await request(path, { method: "PATCH", body: replacement });
  check(replaced.status === 200 && (await replaced.json()).version === (await publication()).edit_version, "current source replacement succeeds with a new revision");
  const insertApplicant = (i) => db.prepare("INSERT INTO applicants (id,submission_key,name,university,email,division,cv_key,cv_filename,cv_size,privacy_acknowledged_at,privacy_policy_version,submitted_at,retention_expires_at,updated_at) VALUES (?,?,?,?,?,'law',?,'test.pdf',1,?,'test',?,?,?)").bind(`a-${i}`, `key-${i}`, `Capacity ${i}`, "Test University", `test-${i}@example.test`, `test/${i}`, now, now, now + 180 * 86400000, now);
  for (let i = 0; i < 501; i += 50) await db.batch(Array.from({ length: Math.min(50, 501 - i) }, (_, offset) => insertApplicant(i + offset)));
  const exported = await request("/api/admin/applicants/export?q=Capacity");
  const rows = (await exported.text()).trim().split("\r\n");
  check(exported.status === 200 && rows.length - 1 === 501 && exported.headers.get("x-export-record-count") === "501", "501 matching applicants export completely");
  const firstPage = await (await request("/admin/applicants?q=Capacity")).text();
  const nextPage = await (await request("/admin/applicants?q=Capacity&page=2")).text();
  check(firstPage.includes("Next page") && nextPage.includes("Previous page"), "applicant pagination exposes records beyond the first page");
  await db.prepare(`WITH RECURSIVE n(i) AS (SELECT 501 UNION ALL SELECT i+1 FROM n WHERE i < 10000)
    INSERT INTO applicants (id,submission_key,name,university,email,division,cv_key,cv_filename,cv_size,privacy_acknowledged_at,privacy_policy_version,submitted_at,retention_expires_at,updated_at)
    SELECT 'a-'||i,'key-'||i,'Capacity '||i,'Test University','test-'||i||'@example.test','law','test/'||i,'test.pdf',1,?,'test',?,?,? FROM n`).bind(now, now, now + 180 * 86400000, now).run();
  const capped = await request("/api/admin/applicants/export?q=Capacity");
  check(capped.status === 422 && (await capped.json()).error.includes("No partial CSV"), "exports over 10,000 records explicitly refuse partial output");
  await stop();
  base = await start("demo");
  const demoPdf = await fetch(base + "/sample-reports/amd-zt-systems.pdf");
  check(demoPdf.status === 200 && (await demoPdf.arrayBuffer()).byteLength === pdf.length, "explicit demo mode still serves its PDF fixtures");
  console.log(`${checks} production-runtime checks passed.`);
} catch (error) {
  console.error(output.slice(-8000));
  throw error;
} finally {
  await stop();
  await proxy?.dispose();
  await rm(scratch, { recursive: true, force: true });
}
