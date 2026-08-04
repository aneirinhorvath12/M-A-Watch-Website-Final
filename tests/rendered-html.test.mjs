import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(path, "http://localhost"), {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the branded home page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Student-led deal intelligence \| M&amp;A Watch<\/title>/i);
  assert.match(html, /The deals that shape markets/i);
  assert.match(html, /Explore our research/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("server-renders public publication collections without private statuses", async () => {
  const response = await render("/reports/strategic");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Strategic Deal Reports/i);
  assert.match(html, /AMD/i);
  assert.doesNotMatch(html, /European infrastructure transactions: autumn outlook/i);
});

function mockD1(store) {
  const schema = [
    "admin_users",
    "publications",
    "publication_revisions",
    "rate_limits",
    "audit_log",
    "background_jobs",
  ].map((name) => ({ name, sql: `CREATE TABLE ${name} (id TEXT)` }));
  schema.push({
    name: "applicants",
    sql: "CREATE TABLE applicants (id TEXT, submission_key TEXT)",
  });
  schema.push({
    name: "application_settings",
    sql: "CREATE TABLE application_settings (id INTEGER, open INTEGER DEFAULT 0)",
  });
  const statement = (sql, bindings = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => {
      if (sql.includes("FROM content_entries")) {
        const value = store.content[bindings[0]];
        return value ? { published_value: JSON.stringify(value) } : null;
      }
      if (sql.includes("FROM application_settings")) return store.applicationSettings;
      if (sql.includes("COUNT(*) AS count FROM team_members")) return { count: 0 };
      return null;
    },
    all: async () => ({
      results: sql.includes("FROM sqlite_schema") ? schema : [],
    }),
    run: async () => ({ meta: { changes: 0 } }),
  });
  return {
    prepare: (sql) => statement(sql),
    batch: async (statements) => Promise.all(statements.map((item) => item.run())),
  };
}

test("D1-backed public pages render fresh published content on the next request", async () => {
  const store = {
    content: {
      "homepage.hero": {
        title: "First live editorial headline",
        body: "First edition",
      },
    },
    applicationSettings: {
      open: 0,
      introduction: "Applications are closed in this test.",
      closed_message: "Please check again later.",
      privacy_policy_version: "2026-08-04",
    },
  };
  const DB = mockD1(store);
  globalThis.__testCloudflareEnv = { DB };
  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("dynamic-content-test", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);
    const runtimeEnv = {
      DB,
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    };
    const context = { waitUntil() {}, passThroughOnException() {} };

    const first = await worker.fetch(new Request("http://localhost/"), runtimeEnv, context);
    assert.match(await first.text(), /First live editorial headline/);

    store.content["homepage.hero"].title = "Second live editorial headline";
    const second = await worker.fetch(new Request("http://localhost/"), runtimeEnv, context);
    const html = await second.text();
    assert.match(html, /Second live editorial headline/);
    assert.doesNotMatch(html, /First live editorial headline/);
  } finally {
    delete globalThis.__testCloudflareEnv;
  }
});
