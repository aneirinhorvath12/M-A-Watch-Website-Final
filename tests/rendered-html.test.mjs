import assert from "node:assert/strict";
import test from "node:test";

function assertArticleSourceOpenTracked(html, publicationType) {
  assert.match(
    html,
    new RegExp(
      `<a[^>]*data-analytics-event="report_pdf_view"[^>]*data-analytics-value="${publicationType}"[^>]*>\\s*Open source report`,
      "i",
    ),
  );
}

async function render(path = "/", publicationContentMode = "demo") {
  const runtimeEnv = {
    ASSETS: {
      fetch: async (input) => {
        const pathname = new URL(
          input instanceof Request ? input.url : String(input),
          "http://localhost",
        ).pathname;
        if (pathname === "/sample-reports/amd-zt-systems.pdf") {
          return new Response("%PDF-1.7 test fixture", {
            status: 200,
            headers: { "content-type": "application/pdf" },
          });
        }
        return new Response("Not found", { status: 404 });
      },
    },
    PUBLICATION_CONTENT_MODE: publicationContentMode,
  };
  globalThis.__testCloudflareEnv = runtimeEnv;
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  try {
    const { default: worker } = await import(workerUrl.href);
    return await worker.fetch(
      new Request(new URL(path, "http://localhost"), {
        headers: { accept: "text/html" },
      }),
      runtimeEnv,
      {
        waitUntil() {},
        passThroughOnException() {},
      },
    );
  } finally {
    delete globalThis.__testCloudflareEnv;
  }
}

test("server-renders the branded home page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Student-led deal intelligence \| M&amp;A Watch<\/title>/i);
  assert.match(html, /The deals that shape markets/i);
  assert.match(html, /Explore our research/i);
  assert.match(html, /src="\/brand\/logo-black-mark\.png"/i);
  assert.match(html, /src="\/brand\/logo-white-mark\.png"/i);
  assert.doesNotMatch(html, /_vinext\/image\?[^"']*logo-(?:black|white)-mark/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("server-renders public publication collections without private statuses", async () => {
  const response = await render("/reports/strategic");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Strategic Deal Reports \| M&amp;A Watch<\/title>/i);
  assert.doesNotMatch(html, /Strategic Deal Reports \| M&amp;A Watch \| M&amp;A Watch/i);
  assert.match(html, /Strategic Deal Reports/i);
  assert.match(html, /AMD/i);
  assert.match(html, /data-analytics-publication-filters="strategic"/i);
  assert.doesNotMatch(html, /European infrastructure transactions: autumn outlook/i);
});

test("report metadata has one brand suffix and a report-specific social card", async () => {
  const response = await render("/reports/strategic/amd-acquisition-zt-systems");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>AMD.s acquisition of ZT Systems \| M&amp;A Watch<\/title>/i);
  assert.doesNotMatch(html, /M&amp;A Watch \| M&amp;A Watch/i);
  assert.match(html, /property="og:image" content="https:\/\/mawatch\.org\/social\/publications\/strategic\/amd-acquisition-zt-systems"/i);
  assert.match(html, /name="twitter:card" content="summary_large_image"/i);
  assert.match(html, /"@id":"https:\/\/mawatch\.org\/reports\/strategic\/amd-acquisition-zt-systems"/i);
  assert.doesNotMatch(html, /data-analytics-pdf-viewer="strategic"/i);
  assert.match(html, /data-analytics-event="report_pdf_view"/i);
  assert.match(html, /data-analytics-event="report_pdf_download"/i);
  assert.match(html, /data-analytics-value="strategic"/i);
  assertArticleSourceOpenTracked(html, "strategic");
});

test("Legal report secondary PDF Open action is analytics tracked", async () => {
  const response = await render("/reports/legal/merger-control-digital-markets");
  assert.equal(response.status, 200);
  assertArticleSourceOpenTracked(await response.text(), "legal");
});

test("Markets tracks its embedded PDF load and explicit PDF actions", async () => {
  const response = await render("/markets/markets-briefing-july-2026");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(
    (html.match(/data-analytics-pdf-viewer="markets"/gi) ?? []).length,
    1,
  );
  assert.match(html, /data-analytics-event="report_pdf_view"/i);
  assert.match(html, /data-analytics-event="report_pdf_download"/i);
});

test("published report social cards render as cacheable PNG images", async () => {
  const response = await render("/social/publications/strategic/amd-acquisition-zt-systems");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^image\/png\b/i);
  assert.match(response.headers.get("cache-control") ?? "", /s-maxage=300/i);
  assert.match(response.headers.get("cache-control") ?? "", /must-revalidate/i);
  assert.ok((await response.arrayBuffer()).byteLength > 1_000);
});

test("unpublished reports cannot expose a social card", async () => {
  const response = await render("/social/publications/strategic/european-infrastructure-autumn-outlook");
  assert.equal(response.status, 404);
});

test("managed publication mode never substitutes demo reports when D1 is unavailable", async () => {
  await assert.rejects(() => render("/reports/strategic", "managed"));
});

test("managed publication mode does not expose static demonstration PDFs", async () => {
  const managed = await render("/sample-reports/amd-zt-systems.pdf", "managed");
  assert.equal(managed.status, 404);
  assert.match(managed.headers.get("cache-control") ?? "", /no-store/i);

  const demo = await render("/sample-reports/amd-zt-systems.pdf", "demo");
  assert.equal(demo.status, 200);
  assert.match(demo.headers.get("content-type") ?? "", /application\/pdf/i);
});

function mockD1(store) {
  const schema = [
    "admin_users",
    "publications",
    "publication_revisions",
    "applicant_notes",
    "applicant_status_history",
    "team_members",
    "content_entries",
    "rate_limits",
    "audit_log",
    "background_jobs",
  ].map((name) => ({
    name,
    sql: name === "background_jobs"
      ? "CREATE TABLE background_jobs (id TEXT, claim_token TEXT)"
      : `CREATE TABLE ${name} (id TEXT)`,
  }));
  schema.push({
    name: "analytics_daily",
    sql: "CREATE TABLE analytics_daily (day TEXT, event TEXT, dimension_name TEXT, dimension_value TEXT, count INTEGER, PRIMARY KEY (day, event, dimension_name, dimension_value))",
  });
  schema.push({
    name: "maintenance_state",
    sql: "CREATE TABLE maintenance_state (id INTEGER PRIMARY KEY, last_completed_at INTEGER, updated_at INTEGER)",
  });
  schema.push({
    name: "applicants",
    sql: "CREATE TABLE applicants (id TEXT, submission_key TEXT, retention_expires_at INTEGER, deletion_requested_at INTEGER)",
  });
  schema.push({
    name: "application_settings",
    sql: "CREATE TABLE application_settings (id INTEGER, open INTEGER DEFAULT 0, retention_days INTEGER)",
  });
  const statement = (sql, bindings = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => {
      if (sql.includes("FROM content_entries")) {
        const value = store.content[bindings[0]];
        return value ? { published_value: JSON.stringify(value) } : null;
      }
      if (sql.includes("FROM application_settings")) return store.applicationSettings;
      if (sql.includes("COUNT(*) AS count FROM team_members")) return { count: store.teamMembers?.length ?? 0 };
      return null;
    },
    all: async () => {
      if (sql.includes("FROM sqlite_schema")) return { results: schema };
      if (sql.includes("FROM team_members WHERE active = 1")) {
        return { results: store.teamMembers ?? [] };
      }
      return { results: [] };
    },
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
      "homepage.editorial": {
        seo: {
          title: "Managed homepage metadata",
          description: "A managed homepage description for search results.",
        },
        hero: {
          eyebrow: "Managed hero eyebrow",
          secondaryCtaLabel: "Managed secondary action",
          secondaryCtaHref: "/apply",
          disciplines: ["Deals", "Regulation", "Capital"],
          deskLabel: "Managed empty desk",
          awaitingLabel: "Managed awaiting label",
          emptyMessage: "Managed empty research message.",
          ruleLabels: ["Managed rule one", "Managed rule two"],
        },
        purpose: { eyebrow: "01 / Managed purpose" },
        latest: {
          eyebrow: "03 / Managed latest",
          title: "Managed current thinking",
          ctaLabel: "Managed view all",
          ctaHref: "/reports/strategic",
        },
        research: {
          eyebrow: "02 / Editable research",
          title: "Research managed in the CMS",
          introduction: "A controlled introduction from the saved published value.",
          areas: [{ number: "01", label: "Managed lens", title: "CMS research area", body: "A safe published research description.", href: "/markets", linkLabel: "Read managed research" }],
        },
        impact: {
          eyebrow: "04 / Managed impact",
          title: "Impact managed in the CMS",
          body: "A controlled impact statement.",
          ctaLabel: "Meet the managed network",
          ctaHref: "/team",
          stats: [{ value: "99", label: "Managed chapters" }],
        },
        application: {
          openEyebrow: "Managed applications open",
          closedEyebrow: "Managed applications closed",
          openTitle: "Managed open title",
          closedTitle: "Managed closed title",
          body: "A managed application call to action.",
          openCtaLabel: "Apply through the CMS",
          closedCtaLabel: "Read managed application details",
          ctaHref: "/apply",
        },
      },
      "site.contact": {
        body: "Managed footer description",
        email: "editorial@mawatch.org",
        emailLabel: "Contact the editorial team",
        socialLinks: [{ label: "LinkedIn", href: "https://www.linkedin.com/company/ma-watch" }],
      },
      "info.page": {
        seo: {
          title: "Managed Info metadata",
          description: "A managed Info page description for search results.",
        },
        eyebrow: "Managed about page",
        title: "A structured Info page",
        introduction: "Only constrained content blocks are rendered.",
        blocks: [
          { type: "heading", level: 2, text: "Managed heading block" },
          { type: "paragraph", text: "Markup stays text: <script>not executable</script>" },
          { type: "image", src: "/og.png", alt: "M&A Watch branded preview", caption: "Managed image caption" },
          { type: "link", label: "Read the team page", href: "/team" },
          { type: "cta", eyebrow: "Next", heading: "Managed call to action", body: "Continue through a safe site path.", primaryLabel: "Read reports", primaryHref: "/reports/strategic", secondaryLabel: "", secondaryHref: "" },
        ],
      },
    },
    applicationSettings: {
      open: 0,
      introduction: "Applications are closed in this test.",
      closed_message: "Please check again later.",
      notification_recipients: "[]",
      privacy_policy_version: "2026-08-04",
      retention_days: null,
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
    const firstHtml = await first.text();
    assert.match(firstHtml, /First live editorial headline/);
    assert.match(firstHtml, /<title>Managed homepage metadata \| M&amp;A Watch<\/title>/);
    assert.match(firstHtml, /name="description" content="A managed homepage description for search results\."/);
    assert.match(firstHtml, /Managed hero eyebrow/);
    assert.match(firstHtml, /Managed secondary action/);
    assert.match(firstHtml, /Managed empty desk/);
    assert.match(firstHtml, /Managed awaiting label/);
    assert.match(firstHtml, /Managed empty research message/);
    assert.match(firstHtml, /01 \/ Managed purpose/);
    assert.match(firstHtml, /Managed current thinking/);
    assert.match(firstHtml, /Managed rule one/);
    assert.match(firstHtml, /Research managed in the CMS/);
    assert.match(firstHtml, /Managed chapters/);
    assert.match(firstHtml, /Managed applications closed/);

    store.content["homepage.hero"].title = "Second live editorial headline";
    const second = await worker.fetch(new Request("http://localhost/"), runtimeEnv, context);
    const html = await second.text();
    assert.match(html, /Second live editorial headline/);
    assert.doesNotMatch(html, /First live editorial headline/);

    const contact = await worker.fetch(new Request("http://localhost/api/content/site.contact"), runtimeEnv, context);
    assert.equal(contact.status, 200);
    assert.equal(contact.headers.get("cache-control"), "no-store");
    assert.deepEqual(await contact.json(), store.content["site.contact"]);

    const info = await worker.fetch(new Request("http://localhost/info"), runtimeEnv, context);
    assert.equal(info.status, 200);
    const infoHtml = await info.text();
    assert.match(infoHtml, /A structured Info page/);
    assert.match(infoHtml, /<title>Managed Info metadata \| M&amp;A Watch<\/title>/);
    assert.match(infoHtml, /name="description" content="A managed Info page description for search results\."/);
    assert.match(infoHtml, /Managed heading block/);
    assert.match(infoHtml, /&lt;script&gt;not executable&lt;\/script&gt;/);
    assert.doesNotMatch(infoHtml, /<script>not executable<\/script>/);
    assert.match(infoHtml, /alt="M&amp;A Watch branded preview"/);
    assert.match(infoHtml, /Managed call to action/);

    const privacy = await worker.fetch(new Request("http://localhost/privacy"), runtimeEnv, context);
    assert.equal(privacy.status, 200);
    const privacyHtml = await privacy.text();
    assert.match(privacyHtml, /180(?:<!-- -->)? days from submission/i);
    assert.match(privacyHtml, /version 2026-08-05/i);
    assert.match(privacyHtml, /editorial@mawatch\.org/i);
    assert.doesNotMatch(privacyHtml, /will be confirmed before public launch/i);

    const retention = await worker.fetch(new Request("http://localhost/retention"), runtimeEnv, context);
    assert.equal(retention.status, 200);
    const retentionHtml = await retention.text();
    assert.match(retentionHtml, /Recruitment data retention policy/i);
    assert.match(retentionHtml, /scheduled maintenance process/i);
    assert.match(retentionHtml, /private CV first/i);
  } finally {
    delete globalThis.__testCloudflareEnv;
  }
});

test("D1-backed team photographs reach the public page with their approved alternative text", async () => {
  const store = {
    content: {},
    teamMembers: [
      {
        id: "team-priya",
        name: "Priya Shah",
        role: "National President",
        group_name: "National leadership",
        biography: "Coordinates the national chapter network.",
        photo_key: "/team/priya-shah.webp",
        photo_alt: "Priya Shah speaking at an M&A Watch event",
        linkedin_url: "https://www.linkedin.com/in/priya-shah",
        display_order: 1,
      },
    ],
  };
  const DB = mockD1(store);
  globalThis.__testCloudflareEnv = { DB };
  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("team-photo-test", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);
    const response = await worker.fetch(
      new Request("http://localhost/team"),
      { DB, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /alt="Priya Shah speaking at an M&amp;A Watch event"/i);
    assert.match(html, /priya-shah\.webp/i);
    assert.doesNotMatch(html, /Portrait placeholder for Priya Shah/i);
  } finally {
    delete globalThis.__testCloudflareEnv;
  }
});

const TEST_ADMIN_ID = "user_admin";
const TEST_SUPER_USER_ID = "user_super";
const TEST_APPLICANT_ID = "application_11111111-1111-4111-8111-111111111111";
const TEST_ASSET_ID = "22222222-2222-4222-8222-222222222222.png";

function adminRow({
  id = TEST_ADMIN_ID,
  email = "admin@mawatch.test",
  role = "admin",
} = {}) {
  return {
    id,
    external_user_id: `chatgpt-${id}`,
    name: email,
    email,
    role,
    status: "active",
    invitation_expires_at: null,
    last_login_at: Date.now(),
  };
}

function securityD1({
  admins = [],
  applicationSettings = null,
  applicants = [],
  jobs = [],
  publications = [],
  teamMembers = [],
  contentEntries = [],
  queuedJobs = [],
  analyticsAttempts = 1,
  publicationMutationChanges = 1,
  modelPublicationParserFailure = false,
  maintenanceLastCompletedAt = Date.now(),
} = {}) {
  const applicantVisibleAt = (applicant, cutoff) => {
    const submittedAt = applicant.submitted_at ?? Date.now();
    const deadline = applicant.retention_expires_at ?? submittedAt + 180 * 24 * 60 * 60 * 1000;
    return deadline > cutoff;
  };
  const applicantForRetentionQuery = (sql, bindings) => {
    const applicant = applicants.find((candidate) => bindings.includes(candidate.id));
    if (!applicant) return null;
    if (!sql.includes("COALESCE(")) return applicant;
    const cutoff = Number(bindings.at(-1));
    return applicantVisibleAt(applicant, cutoff) ? applicant : null;
  };
  const calls = [];
  const auditActions = [];
  const schema = [
    "admin_users",
    "publications",
    "publication_revisions",
    "applicant_notes",
    "applicant_status_history",
    "team_members",
    "content_entries",
    "rate_limits",
    "audit_log",
    "background_jobs",
  ].map((name) => ({
    name,
    sql: name === "background_jobs"
      ? "CREATE TABLE background_jobs (id TEXT, claim_token TEXT)"
      : `CREATE TABLE ${name} (id TEXT)`,
  }));
  schema.push({
    name: "analytics_daily",
    sql: "CREATE TABLE analytics_daily (day TEXT, event TEXT, dimension_name TEXT, dimension_value TEXT, count INTEGER, PRIMARY KEY (day, event, dimension_name, dimension_value))",
  });
  schema.push({
    name: "maintenance_state",
    sql: "CREATE TABLE maintenance_state (id INTEGER PRIMARY KEY, last_completed_at INTEGER, updated_at INTEGER)",
  });
  schema.push({
    name: "applicants",
    sql: "CREATE TABLE applicants (id TEXT, submission_key TEXT, retention_expires_at INTEGER, deletion_requested_at INTEGER)",
  });
  schema.push({
    name: "application_settings",
    sql: "CREATE TABLE application_settings (id INTEGER, open INTEGER DEFAULT 0, retention_days INTEGER)",
  });

  const statement = (sql, bindings = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => {
      calls.push({ operation: "first", sql, bindings });
      if (sql.includes("FROM admin_users WHERE external_user_id = ? OR email = ?")) {
        return admins.find(
          (admin) => admin.external_user_id === bindings[0] || admin.email === bindings[1],
        ) ?? null;
      }
      if (
        sql.includes("FROM applicants WHERE id = ?") ||
        sql.includes("FROM applicants a") && sql.includes("a.id = ?")
      ) {
        return applicantForRetentionQuery(sql, bindings);
      }
      if (sql.includes("FROM application_settings WHERE id = 1")) {
        return typeof applicationSettings === "function"
          ? applicationSettings()
          : applicationSettings;
      }
      if (sql.includes("FROM maintenance_state WHERE id = 1")) {
        return { last_completed_at: maintenanceLastCompletedAt };
      }
      if (sql.includes("SELECT 1 AS present FROM background_jobs") && sql.includes("claim_token = ?")) {
        return { present: 1 };
      }
      if (sql.includes("FROM background_jobs") && sql.includes("'$.applicationId'")) {
        return jobs.find((job) => job.applicationId === bindings[0]) ?? null;
      }
      if (sql.includes("FROM background_jobs") && sql.includes("'$.publicationId'")) {
        return jobs.find((job) => job.publicationId === bindings[0]) ?? null;
      }
      if (sql.includes("FROM publications p") && sql.includes("WHERE p.id = ?")) {
        return publications.find((publication) => publication.id === bindings[0]) ?? null;
      }
      if (sql.includes("COALESCE(MAX(revision_number)")) return { value: 0 };
      if (sql.includes("SELECT id, slug, source_pdf_key FROM publications WHERE id = ?")) {
        return publications.find((publication) => publication.id === bindings[0]) ?? null;
      }
      if (sql.includes("FROM publications WHERE id = ? LIMIT 1")) {
        return publications.find((publication) => publication.id === bindings[0]) ?? null;
      }
      if (sql.includes("WHERE slug = ? AND status = 'published'")) {
        const publication = publications.find(
          (candidate) => candidate.slug === bindings[0] && candidate.status === "published",
        );
        return publication
          ? { title: publication.title, source_pdf_key: publication.source_pdf_key }
          : null;
      }
      if (sql.includes("WHERE slug = ? OR id = ?")) {
        const publication = publications.find(
          (candidate) => candidate.slug === bindings[0] || candidate.id === bindings[1],
        );
        return publication ?? null;
      }
      if (sql.includes("FROM content_entries") && sql.includes("key = 'info.page'")) {
        return contentEntries.find((entry) => entry.key === "info.page") ?? null;
      }
      if (sql.includes("FROM content_entries WHERE key = ?")) {
        return contentEntries.find((entry) => entry.key === bindings[0]) ?? null;
      }
      if (sql.includes("FROM team_members WHERE id = ? AND photo_key = ?")) {
        const member = teamMembers.find(
          (candidate) =>
            candidate.id === bindings[0] && candidate.photo_key === bindings[1],
        );
        return member ? { active: member.active } : null;
      }
      if (sql.includes("RETURNING attempts")) return { attempts: analyticsAttempts };
      return null;
    },
    all: async () => {
      calls.push({ operation: "all", sql, bindings });
      if (sql.includes("FROM sqlite_schema")) return { results: schema };
      if (sql.includes("FROM admin_users ORDER BY")) return { results: admins };
      if (sql.includes("SELECT id, type, payload, attempts FROM background_jobs")) {
        return { results: queuedJobs };
      }
      if (sql.includes("SELECT key, draft_value FROM content_entries")) {
        return { results: contentEntries };
      }
      if (sql.includes("SELECT key, draft_value, published_at FROM content_entries")) {
        return { results: contentEntries };
      }
      if (sql.includes("SELECT id, cv_key, submitted_at, retention_expires_at") && sql.includes("FROM applicants")) {
        const cutoff = Number(bindings[0]);
        const limit = Number(bindings[1]);
        return {
          results: applicants
            .filter((applicant) =>
              applicant.deletion_requested_at == null &&
              !applicantVisibleAt(applicant, cutoff),
            )
            .slice(0, limit),
        };
      }
      if (sql.includes("FROM applicants a")) {
        const cutoff = Number(bindings[0]);
        return {
          results: applicants
            .filter((applicant) => !sql.includes("COALESCE(") || applicantVisibleAt(applicant, cutoff))
            .map((applicant) => ({ ...applicant, duplicate_count: 1 })),
        };
      }
      return { results: [] };
    },
    run: async () => {
      calls.push({ operation: "run", sql, bindings });
      if (modelPublicationParserFailure && bindings[1] === "publication.parse_failed" && sql.includes("INSERT INTO audit_log")) {
        const publication = publications.find(
          (candidate) => candidate.id === bindings[4] && candidate.source_pdf_key === bindings[5],
        );
        const changes = publication?.status === "parsing" ? 1 : 0;
        if (changes) auditActions.push(bindings[1]);
        return { meta: { changes } };
      }
      if (modelPublicationParserFailure && sql.includes("SET status = 'parse_failed', parse_error = ?")) {
        const publication = publications.find(
          (candidate) => candidate.id === bindings[2] && candidate.source_pdf_key === bindings[3],
        );
        const changes = publication?.status === "parsing" ? 1 : 0;
        if (changes) publication.status = "parse_failed";
        return { meta: { changes } };
      }
      if (
        sql.includes("UPDATE publications SET title = ?") ||
        sql.includes("UPDATE publications SET source_pdf_key = ?") ||
        (publicationMutationChanges === 0 &&
          sql.includes("INSERT INTO background_jobs") &&
          sql.includes("FROM publications"))
      ) {
        return { meta: { changes: publicationMutationChanges } };
      }
      if (
        sql.includes("COALESCE(") &&
        (sql.includes("INSERT INTO applicant_notes") ||
          sql.includes("UPDATE applicants SET status = ?"))
      ) {
        return {
          meta: {
            changes: applicantForRetentionQuery(sql, bindings) ? 1 : 0,
          },
        };
      }
      if (sql.includes("UPDATE applicants") && sql.includes("SET deletion_requested_at = ?")) {
        const applicant = applicants.find((candidate) => candidate.id === bindings[2]);
        if (!applicant || applicant.deletion_requested_at != null) {
          return { meta: { changes: 0 } };
        }
        applicant.deletion_requested_at = bindings[0];
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 1 } };
    },
  });

  return {
    binding: {
      prepare: (sql) => statement(sql),
      batch: async (statements) => Promise.all(statements.map((item) => item.run())),
    },
    calls,
    auditActions,
  };
}

function storedObject(body, {
  contentType = "application/pdf",
  scanStatus = "clean",
} = {}) {
  const bytes = new TextEncoder().encode(body);
  return {
    body: bytes,
    size: bytes.byteLength,
    customMetadata: { scanStatus },
    httpMetadata: { contentType },
    writeHttpMetadata(headers) {
      headers.set("content-type", contentType);
    },
  };
}

function securityR2(entries = {}) {
  const objects = new Map(Object.entries(entries));
  const gets = [];
  const heads = [];
  const puts = [];
  const deletes = [];
  return {
    binding: {
      async get(key) {
        gets.push(key);
        return objects.get(key) ?? null;
      },
      async head(key) {
        heads.push(key);
        return objects.get(key) ?? null;
      },
      async put(key, value, options) {
        puts.push({ key, value, options });
        objects.set(key, {
          body: value,
          size: value.byteLength,
          customMetadata: options?.customMetadata ?? {},
          httpMetadata: options?.httpMetadata ?? {},
        });
      },
      async delete(key) {
        deletes.push(key);
        objects.delete(key);
      },
    },
    gets,
    heads,
    puts,
    deletes,
  };
}

async function fetchSecurityRoute(path, {
  d1 = securityD1(),
  r2 = securityR2(),
  identity,
  method = "GET",
  headers = {},
  body,
  runtime = {},
} = {}) {
  const runtimeEnv = {
    DB: d1.binding,
    FILES: r2.binding,
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    ...runtime,
  };
  globalThis.__testCloudflareEnv = runtimeEnv;
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("security-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  try {
    const { default: worker } = await import(workerUrl.href);
    const requestHeaders = new Headers(headers);
    if (!requestHeaders.has("accept")) requestHeaders.set("accept", "application/json");
    if (identity) {
      requestHeaders.set("oai-authenticated-user-id", identity.external_user_id);
      requestHeaders.set("oai-authenticated-user-email", identity.email);
    }
    const requestInit = {
        method,
        headers: requestHeaders,
        body,
      };
    if (body instanceof ReadableStream) requestInit.duplex = "half";
    return await worker.fetch(
      new Request(new URL(path, "https://mawatch.test"), requestInit),
      runtimeEnv,
      { waitUntil() {}, passThroughOnException() {} },
    );
  } finally {
    delete globalThis.__testCloudflareEnv;
  }
}

function openOversizedAnalyticsBody() {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(513).fill(97));
    },
    cancel() {},
  });
  return stream;
}

function openOversizedApplicationBody() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(11 * 1024 * 1024));
      controller.close();
    },
  });
}

test("aggregate analytics is disabled by default and rejects cross-origin or sensitive payloads before D1", async () => {
  const disabledD1 = securityD1();
  const disabled = await fetchSecurityRoute("/api/analytics", {
    d1: disabledD1,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "page_view", value: "home" }),
  });
  assert.equal(disabled.status, 204);
  assert.equal(disabledD1.calls.length, 0);

  const crossOriginD1 = securityD1();
  const crossOrigin = await fetchSecurityRoute("/api/analytics", {
    d1: crossOriginD1,
    method: "POST",
    runtime: { ANALYTICS_ENABLED: "true" },
    headers: {
      "content-type": "application/json",
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
    body: JSON.stringify({ event: "page_view", value: "home" }),
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOriginD1.calls.length, 0);

  const sensitiveD1 = securityD1();
  const sensitive = await fetchSecurityRoute("/api/analytics", {
    d1: sensitiveD1,
    method: "POST",
    runtime: { ANALYTICS_ENABLED: "true" },
    headers: {
      "content-type": "application/json",
      origin: "https://mawatch.test",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({
      event: "application_validation_failure",
      value: "client_validation",
      email: "student@example.test",
    }),
  });
  assert.equal(sensitive.status, 400);
  assert.equal(sensitiveD1.calls.length, 0);
});

test("analytics stream reading cancels at byte 513 despite missing or false Content-Length", async () => {
  for (const contentLength of [undefined, "0"]) {
    const body = openOversizedAnalyticsBody();
    const headers = {
      "content-type": "application/json",
      origin: "https://mawatch.test",
      "sec-fetch-site": "same-origin",
      ...(contentLength === undefined ? {} : { "content-length": contentLength }),
    };
    const d1 = securityD1();
    const response = await fetchSecurityRoute("/api/analytics", {
      d1,
      method: "POST",
      runtime: { ANALYTICS_ENABLED: "true" },
      headers,
      body,
    });
    assert.equal(response.status, 413);
    assert.equal(d1.calls.length, 0, "oversized analytics bodies must not reach D1");
  }
});

test("application CV uploads reject oversized streams with missing or false Content-Length", async () => {
  const settings = {
    open: 1,
    notification_recipients: JSON.stringify(["applications@mawatch.test"]),
    privacy_policy_version: "2026-08-05",
    retention_days: 180,
  };
  const runtime = {
    NEXT_PUBLIC_SITE_URL: "https://mawatch.test",
    APPLICATION_INTAKE_ENABLED: "true",
    MAINTENANCE_SCHEDULER_ENABLED: "true",
    APPROVED_APPLICANT_RETENTION_DAYS: "180",
    APPROVED_APPLICATION_PRIVACY_VERSION: "2026-08-05",
    EMAIL_WEBHOOK_URL: "https://email.mawatch.test/send",
    EMAIL_WEBHOOK_TOKEN: "email-secret",
    MALWARE_SCAN_WEBHOOK_URL: "https://scanner.mawatch.test/scan",
    MALWARE_SCAN_WEBHOOK_TOKEN: "scanner-secret",
  };

  for (const contentLength of [undefined, "1"]) {
    const d1 = securityD1({ applicationSettings: settings });
    const response = await fetchSecurityRoute("/api/applications", {
      d1,
      method: "POST",
      runtime,
      headers: {
        "content-type": "multipart/form-data; boundary=application-upload",
        origin: "https://mawatch.test",
        "sec-fetch-site": "same-origin",
        ...(contentLength === undefined ? {} : { "content-length": contentLength }),
      },
      body: openOversizedApplicationBody(),
    });
    assert.equal(response.status, 413);
    assert.match(await response.text(), /Payload Too Large|CVs may be up to 10 MB/i);
    assert.equal(
      d1.calls.some((call) => call.sql.includes("INSERT INTO applicants")),
      false,
      "oversized application bodies must not reach applicant persistence",
    );
  }
});

test("closing applications after a CV is staged wins and removes the private object", async () => {
  const openSettings = {
    open: 1,
    notification_recipients: JSON.stringify(["applications@mawatch.test"]),
    privacy_policy_version: "2026-08-05",
    retention_days: 180,
  };
  let settingsReads = 0;
  const d1 = securityD1({
    applicationSettings() {
      settingsReads += 1;
      return settingsReads >= 3 ? { ...openSettings, open: 0 } : openSettings;
    },
  });
  const r2 = securityR2();
  const form = new FormData();
  form.set("name", "Applicant Example");
  form.set("university", "Example University");
  form.set("email", "applicant@example.test");
  form.set("division", "law");
  form.set("privacyConsent", "true");
  form.set("formStartedAt", String(Date.now() - 5_000));
  form.set("submissionKey", "closure-race-test");
  form.set(
    "cv",
    new File(["%PDF-1.7\nplain fixture"], "candidate.pdf", {
      type: "application/pdf",
    }),
  );

  const response = await fetchSecurityRoute("/api/applications", {
    d1,
    r2,
    method: "POST",
    runtime: {
      NEXT_PUBLIC_SITE_URL: "https://mawatch.test",
      APPLICATION_INTAKE_ENABLED: "true",
      MAINTENANCE_SCHEDULER_ENABLED: "true",
      APPROVED_APPLICANT_RETENTION_DAYS: "180",
      APPROVED_APPLICATION_PRIVACY_VERSION: "2026-08-05",
      EMAIL_WEBHOOK_URL: "https://email.mawatch.test/send",
      EMAIL_WEBHOOK_TOKEN: "email-secret",
      MALWARE_SCAN_WEBHOOK_URL: "https://scanner.mawatch.test/scan",
      MALWARE_SCAN_WEBHOOK_TOKEN: "scanner-secret",
    },
    headers: {
      origin: "https://mawatch.test",
      "sec-fetch-site": "same-origin",
    },
    body: form,
  });
  assert.equal(response.status, 409);
  assert.equal(r2.puts.length, 1);
  assert.deepEqual(r2.deletes, [r2.puts[0].key]);
  assert.equal(
    d1.calls.some((call) => call.sql.includes("INSERT INTO applicants")),
    false,
  );
});

test("publication creation stores an extensionless valid source under a safe .pdf key", async () => {
  const admin = adminRow();
  const d1 = securityD1({ admins: [admin] });
  const r2 = securityR2();
  const form = new FormData();
  form.set("type", "strategic");
  form.set("title", "Extensionless source report");
  form.set("slug", "extensionless-source-report");
  form.set("summary", "A report used to verify parser-compatible source naming.");
  form.set("publicationDate", "2026-08-04");
  form.set(
    "sourcePdf",
    new File(["%PDF-1.7\nplain fixture"], "uploaded-source", {
      type: "application/pdf",
    }),
  );

  const response = await fetchSecurityRoute("/api/admin/publications", {
    d1,
    r2,
    identity: admin,
    method: "POST",
    headers: {
      origin: "https://mawatch.test",
      "sec-fetch-site": "same-origin",
    },
    body: form,
  });
  assert.equal(response.status, 201);
  assert.equal(r2.puts.length, 1);
  assert.match(r2.puts[0].key, /-uploaded-source\.pdf$/);
  assert.equal(
    r2.puts[0].options.customMetadata.originalFilename,
    "uploaded-source.pdf",
  );
  assert.doesNotMatch(
    JSON.stringify(d1.calls),
    /Extraction will begin after the source file passes the configured malware scan/,
  );
});

test("an admin can recover a parser failure and acknowledge retained warnings", async () => {
  const admin = adminRow();
  const publicationId = "publication_44444444-4444-4444-8444-444444444444";
  const basePublication = {
    id: publicationId,
    type: "strategic",
    title: "Manual recovery report",
    slug: "manual-recovery-report",
    summary: "A publication used to verify parser recovery controls.",
    publication_date: Date.parse("2026-08-04T12:00:00.000Z"),
    status: "parse_failed",
    scheduled_at: null,
    authors: JSON.stringify(["M&A Watch"]),
    chapter: null,
    cover_image_key: null,
    source_pdf_key: `private/publications/${publicationId}/source.pdf`,
    web_body: JSON.stringify([
      { id: "intro", type: "paragraph", content: [{ text: "Manually checked body." }] },
    ]),
    parser_version: "fixture",
    parse_warnings: JSON.stringify(["Check a low-confidence table."]),
    parse_error: "The parser could not read the source layout.",
    structured_metadata: "{}",
    featured: 0,
    created_at: 1_000,
    updated_at: 2_000,
    published_at: null,
  };
  const mutationHeaders = {
    origin: "https://mawatch.test",
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
  };

  const recoveryD1 = securityD1({
    admins: [admin],
    publications: [basePublication],
  });
  const recovery = await fetchSecurityRoute(`/api/admin/publications/${publicationId}`, {
    d1: recoveryD1,
    identity: admin,
    method: "PATCH",
    headers: mutationHeaders,
    body: JSON.stringify({ intent: "manual_draft" }),
  });
  assert.equal(recovery.status, 200);
  const recoveryUpdate = recoveryD1.calls.find(
    (call) => call.operation === "run" && call.sql.includes("UPDATE publications SET title = ?"),
  );
  assert.equal(recoveryUpdate?.bindings[8], "draft");
  assert.equal(recoveryUpdate?.bindings[16], null);
  assert.match(recoveryUpdate?.bindings[15] ?? "", /MANUAL_PARSER_RECOVERY/);
  assert.match(recoveryUpdate?.bindings[15] ?? "", /low-confidence table/);

  const bypassD1 = securityD1({
    admins: [admin],
    publications: [{
      ...basePublication,
      status: "uploaded",
      parse_error: null,
      parse_warnings: "[]",
      updated_at: 2_500,
    }],
  });
  const bypass = await fetchSecurityRoute(`/api/admin/publications/${publicationId}`, {
    d1: bypassD1,
    identity: admin,
    method: "PATCH",
    headers: mutationHeaders,
    body: JSON.stringify({ intent: "manual_draft" }),
  });
  assert.equal(bypass.status, 200);
  const bypassUpdate = bypassD1.calls.find(
    (call) => call.operation === "run" && call.sql.includes("UPDATE publications SET title = ?"),
  );
  assert.match(bypassUpdate?.bindings[15] ?? "", /MANUAL_PARSER_RECOVERY/);

  const acknowledgeD1 = securityD1({
    admins: [admin],
    publications: [{
      ...basePublication,
      status: "draft",
      parse_error: null,
      parse_warnings: recoveryUpdate.bindings[15],
      updated_at: 3_000,
    }],
  });
  const acknowledged = await fetchSecurityRoute(`/api/admin/publications/${publicationId}`, {
    d1: acknowledgeD1,
    identity: admin,
    method: "PATCH",
    headers: mutationHeaders,
    body: JSON.stringify({ intent: "acknowledge_warnings" }),
  });
  assert.equal(acknowledged.status, 200);
  const acknowledgeUpdate = acknowledgeD1.calls.find(
    (call) => call.operation === "run" && call.sql.includes("UPDATE publications SET title = ?"),
  );
  assert.equal(acknowledgeUpdate?.bindings[15], "[]");
  assert.equal(acknowledgeUpdate?.bindings[16], null);
});

test("a late terminal parser failure preserves manual recovery but audits a genuine parsing failure", async () => {
  const publicationId = "publication_55555555-5555-4555-8555-555555555555";
  const sourceKey = `private/publications/${publicationId}/source.pdf`;
  const job = {
    id: "job_55555555-5555-4555-8555-555555555555",
    type: "publication_parse",
    payload: JSON.stringify({ publicationId, key: sourceKey }),
    attempts: 0,
  };
  const runtime = {
    MAINTENANCE_TOKEN: "maintenance-secret",
    PARSER_WEBHOOK_URL: "https://parser.mawatch.test/extract",
    PARSER_WEBHOOK_TOKEN: "parser-secret",
  };

  async function runTerminalFailure(status) {
    const publication = {
      id: publicationId,
      type: "strategic",
      status,
      source_pdf_key: sourceKey,
    };
    const d1 = securityD1({
      publications: [publication],
      queuedJobs: [job],
      modelPublicationParserFailure: true,
    });
    const response = await fetchSecurityRoute("/api/maintenance", {
      d1,
      runtime,
      method: "POST",
      headers: { authorization: "Bearer maintenance-secret" },
    });
    assert.equal(response.status, 200);
    return { d1, publication };
  }

  const recovered = await runTerminalFailure("draft");
  assert.equal(recovered.publication.status, "draft");
  assert.deepEqual(recovered.d1.auditActions, []);

  const processing = await runTerminalFailure("parsing");
  assert.equal(processing.publication.status, "parse_failed");
  assert.deepEqual(processing.d1.auditActions, ["publication.parse_failed"]);
});

test("publication publish and source replacement reject a stale editorial snapshot", async () => {
  const admin = adminRow();
  const publicationId = "publication_33333333-3333-4333-8333-333333333333";
  const sourceKey = `private/publications/${publicationId}/source.pdf`;
  const publication = {
    id: publicationId,
    type: "strategic",
    title: "Concurrent publication",
    slug: "concurrent-publication",
    summary: "A publication used to exercise optimistic workflow guards.",
    publication_date: Date.parse("2026-08-04T12:00:00.000Z"),
    status: "review",
    scheduled_at: null,
    authors: JSON.stringify(["M&A Watch"]),
    chapter: null,
    cover_image_key: null,
    source_pdf_key: sourceKey,
    web_body: JSON.stringify([
      { id: "intro", type: "paragraph", content: [{ text: "Approved body." }] },
    ]),
    parser_version: "fixture",
    parse_warnings: "[]",
    parse_error: null,
    structured_metadata: "{}",
    featured: 0,
    created_at: 1_000,
    updated_at: 2_000,
    published_at: null,
  };
  const d1 = securityD1({
    admins: [admin],
    publications: [publication],
    jobs: [{ publicationId, status: "succeeded" }],
    publicationMutationChanges: 0,
  });
  const r2 = securityR2({
    [sourceKey]: storedObject("%PDF-1.7 clean", { scanStatus: "clean" }),
  });
  const mutationHeaders = {
    origin: "https://mawatch.test",
    "sec-fetch-site": "same-origin",
  };

  const publish = await fetchSecurityRoute(`/api/admin/publications/${publicationId}`, {
    d1,
    r2,
    identity: admin,
    method: "PATCH",
    headers: { ...mutationHeaders, "content-type": "application/json" },
    body: JSON.stringify({ intent: "publish" }),
  });
  assert.equal(publish.status, 409);
  const guardedPublish = d1.calls.find(
    (call) => call.operation === "run" && call.sql.includes("UPDATE publications SET title = ?"),
  );
  assert.match(
    guardedPublish?.sql ?? "",
    /source_pdf_key IS \? AND status = \? AND updated_at = \?/,
  );

  const replacementForm = new FormData();
  replacementForm.set("confirmReplace", "true");
  replacementForm.set(
    "sourcePdf",
    new File(["%PDF-1.7 replacement"], "replacement.pdf", {
      type: "application/pdf",
    }),
  );
  const replacement = await fetchSecurityRoute(`/api/admin/publications/${publicationId}`, {
    d1,
    r2,
    identity: admin,
    method: "PATCH",
    headers: mutationHeaders,
    body: replacementForm,
  });
  assert.equal(replacement.status, 409);
  assert.equal(r2.puts.length, 1);
  assert.deepEqual(r2.deletes, [r2.puts[0].key]);
  const guardedReplacement = d1.calls.find(
    (call) => call.operation === "run" && call.sql.includes("UPDATE publications SET source_pdf_key = ?"),
  );
  assert.match(
    guardedReplacement?.sql ?? "",
    /source_pdf_key IS \? AND status = \? AND updated_at = \?/,
  );
});

test("same-origin analytics writes only a daily aggregate and enforces a public global limit", async () => {
  const d1 = securityD1();
  const response = await fetchSecurityRoute("/api/analytics", {
    d1,
    method: "POST",
    runtime: { ANALYTICS_ENABLED: "true" },
    headers: {
      "content-type": "application/json",
      origin: "https://mawatch.test",
      "sec-fetch-site": "same-origin",
      "cf-connecting-ip": "203.0.113.44",
      "user-agent": "Private test browser",
      referer: "https://mawatch.test/reports?q=sensitive-target",
    },
    body: JSON.stringify({ event: "publication_search", value: "all" }),
  });
  assert.equal(response.status, 204);
  const aggregateWrite = d1.calls.find((call) => call.sql.includes("INSERT INTO analytics_daily"));
  assert.ok(aggregateWrite);
  assert.deepEqual(aggregateWrite.bindings.slice(1, 4), [
    "publication_search",
    "collection",
    "all",
  ]);
  assert.doesNotMatch(
    JSON.stringify(aggregateWrite),
    /203\.0\.113\.44|Private test browser|sensitive-target|student@example/i,
  );
  const limiter = d1.calls.find((call) => call.sql.includes("RETURNING attempts"));
  assert.equal(limiter?.bindings[0], "analytics:public:global");

  const limitedD1 = securityD1({ analyticsAttempts: 3_001 });
  const limited = await fetchSecurityRoute("/api/analytics", {
    d1: limitedD1,
    method: "POST",
    runtime: { ANALYTICS_ENABLED: "true" },
    headers: {
      "content-type": "application/json",
      origin: "https://mawatch.test",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ event: "page_view", value: "home" }),
  });
  assert.equal(limited.status, 429);
  assert.equal(
    limitedD1.calls.some((call) => call.sql.includes("INSERT INTO analytics_daily")),
    false,
  );
});

test("aggregate analytics reporting is Admin-only and appears in regular Admin navigation", async () => {
  const anonymousD1 = securityD1();
  const anonymous = await fetchSecurityRoute("/admin/analytics", {
    d1: anonymousD1,
    headers: { accept: "text/html" },
  });
  assert.match(String(anonymous.status), /^30[2378]$/);
  assert.equal(
    new URL(anonymous.headers.get("location"), "https://mawatch.test").pathname,
    "/admin/login",
  );

  const admin = adminRow();
  const adminD1 = securityD1({ admins: [admin] });
  const allowed = await fetchSecurityRoute("/admin/analytics", {
    d1: adminD1,
    identity: admin,
    headers: { accept: "text/html" },
  });
  assert.equal(allowed.status, 200);
  const html = await allowed.text();
  assert.match(html, /Aggregate analytics/i);
  assert.match(html, /href="\/admin\/analytics"/i);
  assert.match(html, /Cookie-free, first-party daily counters/i);
});

test("page content administration opens as a focused area navigator", async () => {
  const admin = adminRow();
  const d1 = securityD1({
    admins: [admin],
    contentEntries: [
      { key: "homepage.hero", draft_value: "{}", published_at: Date.now() },
      { key: "homepage.overview", draft_value: "{}", published_at: Date.now() },
      { key: "homepage.editorial", draft_value: "{}", published_at: null },
      { key: "info.page", draft_value: "{}", published_at: null },
      { key: "site.contact", draft_value: "{}", published_at: Date.now() },
    ],
  });

  const landing = await fetchSecurityRoute("/admin/content", {
    d1,
    identity: admin,
    headers: { accept: "text/html" },
  });
  assert.equal(landing.status, 200);
  const landingHtml = await landing.text();
  assert.match(landingHtml, /Choose an area to edit/i);
  assert.match(landingHtml, /href="\/admin\/content\?section=homepage-hero"/i);
  assert.match(landingHtml, /Homepage areas/i);
  assert.match(landingHtml, /Other website content areas/i);
  assert.match(landingHtml, /Published version exists; saved draft may differ/i);
  assert.match(landingHtml, /No published version yet/i);
  assert.doesNotMatch(landingHtml, /Publish saved draft/i);

  const info = await fetchSecurityRoute("/admin/content?section=info", {
    d1,
    identity: admin,
    headers: { accept: "text/html" },
  });
  assert.equal(info.status, 200);
  const infoHtml = await info.text();
  assert.match(infoHtml, /Switch content area/i);
  assert.match(infoHtml, /All page content/i);
  assert.match(infoHtml, /Publish saved draft/i);
  assert.match(infoHtml, /No published version/i);
  assert.doesNotMatch(infoHtml, /Homepage hero/i);
});

test("direct admin APIs deny anonymous, non-member, under-privileged and cross-origin requests", async () => {
  const noMemberD1 = securityD1();
  const anonymous = await fetchSecurityRoute("/api/admin/users", { d1: noMemberD1 });
  assert.equal(anonymous.status, 401);
  assert.equal(noMemberD1.calls.length, 0, "anonymous denial must happen before D1 access");

  const unknownIdentity = adminRow({ email: "unknown@mawatch.test" });
  const nonMember = await fetchSecurityRoute("/api/admin/users", {
    d1: noMemberD1,
    identity: unknownIdentity,
  });
  assert.equal(nonMember.status, 401);

  const regularAdmin = adminRow();
  const adminD1 = securityD1({ admins: [regularAdmin] });
  const roleEscalation = await fetchSecurityRoute("/api/admin/users", {
    d1: adminD1,
    identity: regularAdmin,
  });
  assert.equal(roleEscalation.status, 403);
  assert.match(await roleEscalation.text(), /restricted to Super Users/i);

  const superUser = adminRow({
    id: TEST_SUPER_USER_ID,
    email: "super@mawatch.test",
    role: "super_user",
  });
  const crossOriginD1 = securityD1({ admins: [superUser] });
  const crossOrigin = await fetchSecurityRoute("/api/admin/users", {
    d1: crossOriginD1,
    identity: superUser,
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
    body: JSON.stringify({ name: "Injected User", email: "evil@example.test", role: "super_user" }),
  });
  assert.equal(crossOrigin.status, 403);
  assert.match(await crossOrigin.text(), /Invalid request origin/i);
  assert.equal(
    crossOriginD1.calls.length,
    0,
    "cross-origin mutation denial must happen before identity or database access",
  );
});

test("direct Super User page navigation redirects anonymous and regular administrators", async () => {
  const anonymousD1 = securityD1();
  const anonymous = await fetchSecurityRoute("/admin/users", {
    d1: anonymousD1,
    headers: { accept: "text/html" },
  });
  assert.match(String(anonymous.status), /^30[2378]$/);
  assert.equal(
    new URL(anonymous.headers.get("location"), "https://mawatch.test").pathname,
    "/admin/login",
  );
  assert.match(anonymous.headers.get("location") ?? "", /return_to=%2Fadmin(?:&|$)/);
  assert.equal(anonymousD1.calls.length, 0);

  const regularAdmin = adminRow();
  const adminD1 = securityD1({ admins: [regularAdmin] });
  const denied = await fetchSecurityRoute("/admin/users", {
    d1: adminD1,
    identity: regularAdmin,
    headers: { accept: "text/html" },
  });
  assert.match(String(denied.status), /^30[2378]$/);
  assert.equal(
    new URL(denied.headers.get("location"), "https://mawatch.test").pathname,
    "/admin",
  );
  assert.equal(
    new URL(denied.headers.get("location"), "https://mawatch.test").searchParams.get("notice"),
    "permission-denied",
  );
});

test("saved content previews require an active administrator and render the draft through the public page component", async () => {
  const anonymousD1 = securityD1();
  const anonymous = await fetchSecurityRoute("/preview/content/homepage", {
    d1: anonymousD1,
    headers: { accept: "text/html" },
  });
  assert.match(String(anonymous.status), /^30[2378]$/);
  assert.equal(
    new URL(anonymous.headers.get("location"), "https://mawatch.test").pathname,
    "/admin/login",
  );
  assert.equal(anonymousD1.calls.length, 0);

  const admin = adminRow();
  const d1 = securityD1({
    admins: [admin],
    contentEntries: [{
      key: "homepage.hero",
      draft_value: JSON.stringify({
        title: "Authenticated saved-draft headline",
        body: "This text exists only in the saved draft.",
        ctaLabel: "Preview research",
        ctaHref: "/reports/strategic",
      }),
    }],
  });
  const preview = await fetchSecurityRoute("/preview/content/homepage", {
    d1,
    identity: admin,
    headers: { accept: "text/html" },
  });
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get("cache-control") ?? "", /no-store/i);
  const html = await preview.text();
  assert.match(html, /Private saved-draft preview/i);
  assert.match(html, /Authenticated saved-draft headline/);
  assert.match(html, /This text exists only in the saved draft/);
  assert.match(html, /name="robots" content="noindex, nofollow, nocache"/i);
});

test("private applicant CV routes require membership and release only clean, correctly scoped objects", async () => {
  const cvKey = `private/applicants/${TEST_APPLICANT_ID}/candidate.pdf`;
  const cleanObject = storedObject("%PDF-1.7 clean applicant CV");
  const r2 = securityR2({ [cvKey]: cleanObject });
  const anonymousD1 = securityD1();
  const anonymous = await fetchSecurityRoute(`/api/files/applicants/${TEST_APPLICANT_ID}/cv`, {
    d1: anonymousD1,
    r2,
  });
  assert.equal(anonymous.status, 401);
  assert.deepEqual(r2.gets, []);
  assert.deepEqual(r2.heads, []);

  const admin = adminRow();
  const invalidReferenceD1 = securityD1({
    admins: [admin],
    applicants: [{
      id: TEST_APPLICANT_ID,
      cv_key: "private/applicants/someone-else/candidate.pdf",
      cv_filename: "candidate.pdf",
      deletion_requested_at: null,
    }],
  });
  const invalidReference = await fetchSecurityRoute(
    `/api/files/applicants/${TEST_APPLICANT_ID}/cv`,
    { d1: invalidReferenceD1, r2, identity: admin },
  );
  assert.equal(invalidReference.status, 404);
  assert.deepEqual(r2.gets, []);
  assert.deepEqual(r2.heads, []);

  const quarantinedD1 = securityD1({
    admins: [admin],
    applicants: [{
      id: TEST_APPLICANT_ID,
      cv_key: cvKey,
      cv_filename: "candidate.pdf",
      deletion_requested_at: null,
    }],
    jobs: [{ applicationId: TEST_APPLICANT_ID, status: "running", error: null }],
  });
  const quarantined = await fetchSecurityRoute(`/api/files/applicants/${TEST_APPLICANT_ID}/cv`, {
    d1: quarantinedD1,
    r2,
    identity: admin,
  });
  assert.equal(quarantined.status, 423);
  assert.deepEqual(r2.gets, [], "quarantined bytes must never be read from R2");

  const cleanD1 = securityD1({
    admins: [admin],
    applicants: [{
      id: TEST_APPLICANT_ID,
      cv_key: cvKey,
      cv_filename: "../../candidate<script>.pdf",
      deletion_requested_at: null,
    }],
    jobs: [{ applicationId: TEST_APPLICANT_ID, status: "succeeded", error: null }],
  });
  const clean = await fetchSecurityRoute(`/api/files/applicants/${TEST_APPLICANT_ID}/cv`, {
    d1: cleanD1,
    r2,
    identity: admin,
  });
  assert.equal(clean.status, 200);
  assert.equal(clean.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(clean.headers.get("content-type"), "application/pdf");
  assert.match(clean.headers.get("content-disposition") ?? "", /^attachment; filename="[^/<>]+"$/);
  assert.equal(clean.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.equal(clean.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(await clean.text(), "%PDF-1.7 clean applicant CV");
});

test("expired applicants are synchronously hidden from every administrative surface", async () => {
  const admin = adminRow();
  const cvKey = `private/applicants/${TEST_APPLICANT_ID}/expired.pdf`;
  const expiredApplicant = {
    id: TEST_APPLICANT_ID,
    name: "Expired Applicant",
    university: "Old University",
    email: "expired@example.test",
    division: "law",
    status: "new",
    cv_key: cvKey,
    cv_filename: "expired.pdf",
    cv_size: 100,
    privacy_acknowledged_at: Date.now() - 1_000_000,
    privacy_policy_version: "2026-08-05",
    submitted_at: Date.now() - 181 * 24 * 60 * 60 * 1000,
    retention_expires_at: null,
    deletion_requested_at: null,
    updated_at: Date.now() - 1_000_000,
  };
  const d1 = securityD1({ admins: [admin], applicants: [expiredApplicant] });
  const r2 = securityR2({ [cvKey]: storedObject("%PDF-1.7 expired private CV") });

  const list = await fetchSecurityRoute("/admin/applicants", {
    d1,
    identity: admin,
    headers: { accept: "text/html" },
  });
  assert.equal(list.status, 200);
  const listHtml = await list.text();
  assert.doesNotMatch(listHtml, /Expired Applicant|expired@example\.test/);

  const detail = await fetchSecurityRoute(`/admin/applicants/${TEST_APPLICANT_ID}`, {
    d1,
    identity: admin,
    headers: { accept: "text/html" },
  });
  assert.equal(detail.status, 404);

  const exported = await fetchSecurityRoute("/api/admin/applicants/export", {
    d1,
    identity: admin,
  });
  assert.equal(exported.status, 200);
  assert.doesNotMatch(await exported.text(), /Expired Applicant|expired@example\.test/);

  const cv = await fetchSecurityRoute(`/api/files/applicants/${TEST_APPLICANT_ID}/cv`, {
    d1,
    r2,
    identity: admin,
  });
  assert.equal(cv.status, 404);
  assert.deepEqual(r2.heads, []);
  assert.deepEqual(r2.gets, []);

  const mutationHeaders = {
    "content-type": "application/json",
    origin: "https://mawatch.test",
    "sec-fetch-site": "same-origin",
  };
  const note = await fetchSecurityRoute(`/api/admin/applicants/${TEST_APPLICANT_ID}/notes`, {
    d1,
    identity: admin,
    method: "POST",
    headers: mutationHeaders,
    body: JSON.stringify({ body: "Should not persist" }),
  });
  assert.equal(note.status, 404);

  const status = await fetchSecurityRoute(`/api/admin/applicants/${TEST_APPLICANT_ID}/status`, {
    d1,
    identity: admin,
    method: "PATCH",
    headers: mutationHeaders,
    body: JSON.stringify({ status: "reviewing" }),
  });
  assert.equal(status.status, 404);
  assert.equal(
    d1.calls.some((call) => call.sql.includes("INSERT INTO applicant_notes")),
    false,
  );
  assert.equal(
    d1.calls.some((call) => call.sql.includes("UPDATE applicants SET status = ?")),
    false,
  );
});

test("application intake closes when the persisted maintenance heartbeat is stale", async () => {
  const settings = {
    open: 1,
    introduction: "Apply now",
    closed_message: "Closed",
    notification_recipients: JSON.stringify(["applications@mawatch.test"]),
    privacy_policy_version: "2026-08-05",
    retention_days: 180,
  };
  const runtime = {
    NEXT_PUBLIC_SITE_URL: "https://mawatch.test",
    APPLICATION_INTAKE_ENABLED: "true",
    MAINTENANCE_SCHEDULER_ENABLED: "true",
    APPROVED_APPLICANT_RETENTION_DAYS: "180",
    APPROVED_APPLICATION_PRIVACY_VERSION: "2026-08-05",
    EMAIL_WEBHOOK_URL: "https://email.mawatch.test/send",
    EMAIL_WEBHOOK_TOKEN: "email-secret",
    MALWARE_SCAN_WEBHOOK_URL: "https://scanner.mawatch.test/scan",
    MALWARE_SCAN_WEBHOOK_TOKEN: "scanner-secret",
  };
  const d1 = securityD1({
    applicationSettings: settings,
    maintenanceLastCompletedAt: Date.now() - 21 * 60 * 1000,
  });
  const status = await fetchSecurityRoute("/api/applications/status", {
    d1,
    runtime,
  });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).open, false);

  const submission = await fetchSecurityRoute("/api/applications", {
    d1,
    method: "POST",
    runtime,
    headers: {
      origin: "https://mawatch.test",
      "sec-fetch-site": "same-origin",
    },
    body: new FormData(),
  });
  assert.equal(submission.status, 503);
  assert.equal(
    d1.calls.some((call) => call.sql.includes("INSERT INTO applicants")),
    false,
  );
});

test("maintenance handles legacy expiry and an invalid oldest CV key without starving later deletion", async () => {
  const submittedAt = Date.now() - 181 * 24 * 60 * 60 * 1000;
  const invalidId = "application_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const validId = "application_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const applicants = [
    {
      id: invalidId,
      cv_key: "private/applicants/someone-else/unsafe.pdf",
      submitted_at: submittedAt,
      retention_expires_at: null,
      deletion_requested_at: null,
    },
    {
      id: validId,
      cv_key: `private/applicants/${validId}/cv.pdf`,
      submitted_at: submittedAt + 1,
      retention_expires_at: null,
      deletion_requested_at: null,
    },
  ];
  const d1 = securityD1({ applicants });
  const r2 = securityR2();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
  try {
    const response = await fetchSecurityRoute("/api/maintenance", {
      d1,
      r2,
      method: "POST",
      headers: { authorization: "Bearer maintenance-secret" },
      runtime: {
        MAINTENANCE_TOKEN: "maintenance-secret",
        MAINTENANCE_HEARTBEAT_URL: "https://heartbeat.example/check-in",
        MAINTENANCE_ALERT_WEBHOOK_URL: "https://alerts.example/maintenance",
        MAINTENANCE_ALERT_WEBHOOK_TOKEN: "alert-secret",
      },
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.summary.retentionQueued, 1);
    assert.equal(result.summary.failed, 1);
    assert.ok(applicants.every((applicant) => applicant.deletion_requested_at != null));
    assert.equal(
      d1.calls.some((call) =>
        call.sql.includes("'applicant_delete', 'failed'") &&
        call.bindings.some((binding) => String(binding).includes(invalidId)),
      ),
      true,
    );
    assert.equal(
      d1.calls.some((call) =>
        call.sql.includes("'applicant_delete', 'queued'") &&
        call.bindings.some((binding) => String(binding).includes(validId)),
      ),
      true,
    );
    assert.deepEqual(r2.deletes, [], "an unsafe object reference must never be deleted");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("successful applicant deletion removes audit and job linkage", async () => {
  const applicantId = "application_cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const key = `private/applicants/${applicantId}/cv.pdf`;
  const jobId = `job_delete_${applicantId}`;
  const applicant = {
    id: applicantId,
    cv_key: key,
    submitted_at: Date.now() - 181 * 24 * 60 * 60 * 1000,
    retention_expires_at: Date.now() - 60_000,
    deletion_requested_at: Date.now() - 30_000,
    deletion_requested_by: null,
  };
  const d1 = securityD1({
    applicants: [applicant],
    queuedJobs: [{
      id: jobId,
      type: "applicant_delete",
      payload: JSON.stringify({
        applicationId: applicantId,
        key,
        reason: "retention_expired",
      }),
      attempts: 0,
    }],
  });
  const r2 = securityR2({ [key]: storedObject("%PDF-1.7 expired") });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
  try {
    const response = await fetchSecurityRoute("/api/maintenance", {
      d1,
      r2,
      method: "POST",
      headers: { authorization: "Bearer maintenance-secret" },
      runtime: {
        MAINTENANCE_TOKEN: "maintenance-secret",
        MAINTENANCE_HEARTBEAT_URL: "https://heartbeat.example/check-in",
      },
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.summary.succeeded, 1);
    assert.deepEqual(r2.deletes, [key]);
    assert.equal(
      d1.calls.some((call) =>
        call.sql.includes("DELETE FROM audit_log") &&
        call.sql.includes("entity_type = 'applicant'") &&
        call.bindings.includes(applicantId),
      ),
      true,
    );
    assert.equal(
      d1.calls.some((call) =>
        call.sql.includes("DELETE FROM background_jobs") &&
        call.sql.includes("WHERE id = ? AND status = 'running'") &&
        call.bindings.includes(jobId),
      ),
      true,
    );
    assert.equal(
      d1.calls.some((call) =>
        call.sql.includes("'applicant.deleted'") ||
        call.sql.includes("SET status = 'succeeded'") && call.bindings.includes(jobId),
      ),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publication file routes keep sources private and expose only clean published derivatives", async () => {
  const admin = adminRow();
  const sourceKey = "private/publication-sources/report.pdf";
  const cleanSource = storedObject("%PDF-1.7 clean report");
  const quarantinedSource = storedObject("%PDF-1.7 quarantined report", { scanStatus: "pending" });
  const publication = {
    id: "publication-draft",
    slug: "draft-report",
    title: "Draft / Report",
    status: "draft",
    source_pdf_key: sourceKey,
  };
  const draftD1 = securityD1({ admins: [admin], publications: [publication] });
  const cleanR2 = securityR2({ [sourceKey]: cleanSource });

  const anonymousSource = await fetchSecurityRoute(
    `/api/files/publications/${publication.id}/source`,
    { d1: draftD1, r2: cleanR2 },
  );
  assert.equal(anonymousSource.status, 401);
  assert.deepEqual(cleanR2.gets, []);

  const authenticatedSource = await fetchSecurityRoute(
    `/api/files/publications/${publication.id}/source`,
    { d1: draftD1, r2: cleanR2, identity: admin },
  );
  assert.equal(authenticatedSource.status, 200);
  assert.equal(authenticatedSource.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(
    authenticatedSource.headers.get("content-security-policy"),
    "base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'none'; upgrade-insecure-requests",
  );

  const quarantineR2 = securityR2({ [sourceKey]: quarantinedSource });
  const quarantined = await fetchSecurityRoute(
    `/api/files/publications/${publication.id}/source`,
    { d1: draftD1, r2: quarantineR2, identity: admin },
  );
  assert.equal(quarantined.status, 423);

  const unpublishedPdf = await fetchSecurityRoute("/api/publications/draft-report/pdf", {
    d1: draftD1,
    r2: cleanR2,
  });
  assert.equal(unpublishedPdf.status, 404);

  const published = { ...publication, id: "publication-published", slug: "published-report", status: "published" };
  const publishedD1 = securityD1({ publications: [published] });
  const dirtyPublicPdf = await fetchSecurityRoute("/api/publications/published-report/pdf", {
    d1: publishedD1,
    r2: quarantineR2,
  });
  assert.equal(dirtyPublicPdf.status, 404);

  const cleanPublicPdf = await fetchSecurityRoute("/api/publications/published-report/pdf?download=1", {
    d1: publishedD1,
    r2: cleanR2,
  });
  assert.equal(cleanPublicPdf.status, 200);
  assert.equal(cleanPublicPdf.headers.get("content-type"), "application/pdf");
  assert.match(cleanPublicPdf.headers.get("content-disposition") ?? "", /^attachment;/);
  assert.match(cleanPublicPdf.headers.get("cache-control") ?? "", /^public,/);
  assert.equal(cleanPublicPdf.headers.get("x-content-type-options"), "nosniff");
});

test("Admin image uploads derive dimensions from bytes for article, cover and Info assets", async () => {
  const admin = adminRow();
  const publication = {
    id: "publication_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    slug: "upload-target",
    status: "draft",
    cover_image_key: null,
  };
  const d1 = securityD1({ admins: [admin], publications: [publication] });
  const r2 = securityR2();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const upload = async (path, field, includeAlt = false) => {
    const form = new FormData();
    form.set(field, new File([png], "managed.png", { type: "image/png" }));
    form.set("width", "8192");
    form.set("height", "8192");
    if (includeAlt) form.set("alt", "Students reviewing a transaction report");
    const response = await fetchSecurityRoute(path, {
      d1,
      r2,
      identity: admin,
      method: "POST",
      headers: { origin: "https://mawatch.test" },
      body: form,
    });
    const result = await response.json();
    assert.equal(response.status, 201, result.error);
    const dimensions = result.cover ?? result;
    assert.equal(dimensions.width, 1, JSON.stringify(result));
    assert.equal(dimensions.height, 1, JSON.stringify(result));
    return result;
  };

  await upload(`/api/admin/publications/${publication.id}/images`, "image");
  await upload(`/api/admin/publications/${publication.id}/cover`, "cover", true);
  await upload("/api/admin/content/info/assets", "image", true);
  assert.equal(r2.puts.length, 3);
  assert.match(r2.puts[0].key, new RegExp(`^private/publication-assets/${publication.id}/`));
  assert.match(r2.puts[1].key, new RegExp(`^private/publication-covers/${publication.id}/`));
  assert.match(r2.puts[2].key, /^private\/site-assets\/info\//);
  for (const put of r2.puts) {
    assert.equal(put.options.httpMetadata.contentType, "image/png");
    assert.equal(put.options.customMetadata.width, "1");
    assert.equal(put.options.customMetadata.height, "1");
  }
});

test("unpublished publication assets are indistinguishable from missing files to anonymous users", async () => {
  const admin = adminRow();
  const draft = {
    id: "publication-assets-draft",
    slug: "asset-preview",
    title: "Asset preview",
    status: "draft",
    source_pdf_key: null,
  };
  const assetKey = `private/publication-assets/${draft.id}/${TEST_ASSET_ID}`;
  const image = storedObject("PNG", { contentType: "image/png" });
  const r2 = securityR2({ [assetKey]: image });
  const d1 = securityD1({ admins: [admin], publications: [draft] });

  const invalidAsset = await fetchSecurityRoute(
    `/api/publications/${draft.slug}/images/not-an-id.svg`,
    { d1, r2 },
  );
  assert.equal(invalidAsset.status, 404);
  assert.deepEqual(r2.gets, []);

  const anonymous = await fetchSecurityRoute(
    `/api/publications/${draft.slug}/images/${TEST_ASSET_ID}`,
    { d1, r2 },
  );
  assert.equal(anonymous.status, 404);
  assert.deepEqual(r2.gets, [], "anonymous draft access must not reveal whether an R2 object exists");

  const authenticated = await fetchSecurityRoute(
    `/api/publications/${draft.slug}/images/${TEST_ASSET_ID}`,
    { d1, r2, identity: admin },
  );
  assert.equal(authenticated.status, 200);
  assert.equal(authenticated.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(authenticated.headers.get("cross-origin-resource-policy"), "same-origin");

  const published = {
    ...draft,
    status: "published",
    web_body: JSON.stringify([{
      type: "image",
      src: `/api/publications/${draft.id}/images/${TEST_ASSET_ID}`,
    }]),
  };
  const publishedD1 = securityD1({ publications: [published] });
  const publicAsset = await fetchSecurityRoute(
    `/api/publications/${draft.slug}/images/${TEST_ASSET_ID}`,
    { d1: publishedD1, r2 },
  );
  assert.equal(publicAsset.status, 200);
  assert.match(publicAsset.headers.get("cache-control") ?? "", /^public,/);
  assert.equal(publicAsset.headers.get("content-type"), "image/png");
});

test("managed covers and Info images expose only exact published references", async () => {
  const admin = adminRow();
  const coverId = "55555555-5555-4555-8555-555555555555.png";
  const infoId = "66666666-6666-4666-8666-666666666666.png";
  const publication = {
    id: "publication_77777777-7777-4777-8777-777777777777",
    slug: "covered-report",
    status: "published",
    cover_image_key: JSON.stringify({
      schema: "publication-cover-v1",
      assetId: coverId,
      alt: "A blue covered report",
      width: 1200,
      height: 1600,
      contentType: "image/png",
    }),
  };
  const coverPath = `/api/publications/${publication.slug}/cover/${coverId}`;
  const infoPath = `/api/content/info/assets/${infoId}`;
  const infoPublished = JSON.stringify({
    blocks: [{ type: "image", src: infoPath, alt: "Students discussing research", width: 1200, height: 800 }],
  });
  const d1 = securityD1({
    admins: [admin],
    publications: [publication],
    contentEntries: [{
      key: "info.page",
      draft_value: infoPublished,
      published_value: infoPublished,
      published_at: Date.now(),
    }],
  });
  const r2 = securityR2({
    [`private/publication-covers/${publication.id}/${coverId}`]: storedObject("PNG cover", { contentType: "image/png" }),
    [`private/site-assets/info/${infoId}`]: storedObject("PNG Info", { contentType: "image/png" }),
  });
  const cover = await fetchSecurityRoute(coverPath, { d1, r2 });
  assert.equal(cover.status, 200);
  assert.match(cover.headers.get("cache-control") ?? "", /max-age=300/);
  assert.equal((await fetchSecurityRoute(infoPath, { d1, r2 })).status, 200);
  assert.equal(
    (await fetchSecurityRoute(`/api/publications/${publication.slug}/cover/${TEST_ASSET_ID}`, { d1, r2 })).status,
    404,
  );

  const draftD1 = securityD1({
    admins: [admin],
    publications: [{ ...publication, status: "draft" }],
    contentEntries: [{
      key: "info.page",
      draft_value: infoPublished,
      published_value: "{}",
      published_at: null,
    }],
  });
  assert.equal((await fetchSecurityRoute(coverPath, { d1: draftD1, r2 })).status, 404);
  assert.equal((await fetchSecurityRoute(coverPath, { d1: draftD1, r2, identity: admin })).status, 200);
  assert.equal((await fetchSecurityRoute(infoPath, { d1: draftD1, r2 })).status, 404);
  assert.equal((await fetchSecurityRoute(infoPath, { d1: draftD1, r2, identity: admin })).status, 200);
});

test("the image optimizer resolves only public managed routes and keeps derivatives revocable", async () => {
  const coverId = "88888888-8888-4888-8888-888888888888.png";
  const publication = {
    id: "publication_99999999-9999-4999-8999-999999999999",
    slug: "optimizer-report",
    status: "published",
    cover_image_key: JSON.stringify({
      schema: "publication-cover-v1",
      assetId: coverId,
      alt: "Optimized report cover",
      width: 1200,
      height: 1600,
      contentType: "image/png",
    }),
  };
  const sourcePath = `/api/publications/${publication.slug}/cover/${coverId}`;
  const d1 = securityD1({ publications: [publication] });
  const r2 = securityR2({
    [`private/publication-covers/${publication.id}/${coverId}`]: storedObject("PNG source", { contentType: "image/png" }),
  });
  let staticFetches = 0;
  const runtime = {
    ASSETS: { fetch: async () => { staticFetches += 1; return new Response("Not found", { status: 404 }); } },
    IMAGES: {
      input(stream) {
        return {
          transform() {
            return {
              output: async () => ({
                response: () => new Response(stream, { headers: { "content-type": "image/webp" } }),
              }),
            };
          },
        };
      },
    },
  };
  const optimizerPath = `/_vinext/image?url=${encodeURIComponent(sourcePath)}&w=640&q=75`;
  const optimized = await fetchSecurityRoute(optimizerPath, {
    d1,
    r2,
    runtime,
    headers: { accept: "image/webp,image/*" },
  });
  assert.equal(optimized.status, 200);
  assert.equal(optimized.headers.get("content-type"), "image/webp");
  assert.equal(optimized.headers.get("cache-control"), "public, max-age=300, s-maxage=300, must-revalidate");
  assert.equal(staticFetches, 0, "managed API images must be sourced through their reference-gated route");

  const unpublished = securityD1({ publications: [{ ...publication, status: "draft" }] });
  const revoked = await fetchSecurityRoute(optimizerPath, {
    d1: unpublished,
    r2,
    runtime,
    headers: { accept: "image/webp,image/*" },
  });
  assert.equal(revoked.status, 404);
});

test("managed team photographs are member-scoped and inactive images require an Admin", async () => {
  const admin = adminRow();
  const memberId = "team_33333333-3333-4333-8333-333333333333";
  const assetId = "44444444-4444-4444-8444-444444444444.png";
  const photoPath = `/api/team/images/${memberId}/${assetId}`;
  const assetKey = `private/team-assets/${memberId}/${assetId}`;
  const image = storedObject("PNG team portrait", { contentType: "image/png" });

  const publicR2 = securityR2({ [assetKey]: image });
  const activeD1 = securityD1({
    teamMembers: [{ id: memberId, photo_key: photoPath, active: 1 }],
  });
  const publicPhoto = await fetchSecurityRoute(photoPath, {
    d1: activeD1,
    r2: publicR2,
  });
  assert.equal(publicPhoto.status, 200);
  assert.equal(publicPhoto.headers.get("content-type"), "image/png");
  assert.match(publicPhoto.headers.get("cache-control") ?? "", /^public,/);
  assert.equal(publicPhoto.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    publicPhoto.headers.get("cross-origin-resource-policy"),
    "same-origin",
  );

  const privateR2 = securityR2({ [assetKey]: image });
  const inactiveD1 = securityD1({
    admins: [admin],
    teamMembers: [{ id: memberId, photo_key: photoPath, active: 0 }],
  });
  const anonymous = await fetchSecurityRoute(photoPath, {
    d1: inactiveD1,
    r2: privateR2,
  });
  assert.equal(anonymous.status, 404);
  assert.deepEqual(privateR2.gets, []);

  const authenticated = await fetchSecurityRoute(photoPath, {
    d1: inactiveD1,
    r2: privateR2,
    identity: admin,
  });
  assert.equal(authenticated.status, 200);
  assert.equal(
    authenticated.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );

  const wrongAsset = await fetchSecurityRoute(
    `/api/team/images/${memberId}/55555555-5555-4555-8555-555555555555.png`,
    { d1: activeD1, r2: publicR2 },
  );
  assert.equal(wrongAsset.status, 404);
});
