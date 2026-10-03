import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { matchesPublicationVersion } from "../lib/publication-edit-version";
import { hasExpectedSchema, type SchemaDefinition } from "../lib/schema-readiness";

function migratedDatabase() {
  const db = new DatabaseSync(":memory:");
  for (const filename of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    db.exec(readFileSync(`drizzle/${filename}`, "utf8"));
  }
  return db;
}

test("publication version tokens require an explicit, exact, nonnegative integer", () => {
  for (const invalid of [undefined, null, "", " ", "0.0", "0x0", false, -1, 1, "1", NaN]) {
    assert.equal(matchesPublicationVersion(invalid, 0), false, String(invalid));
  }
  assert.equal(matchesPublicationVersion("0", 0), true);
  assert.equal(matchesPublicationVersion(42, 42), true);
});

test("real migrations provide the readiness schema and require the version trigger", () => {
  const db = migratedDatabase();
  try {
    const definitions = db.prepare("SELECT name, sql FROM sqlite_schema").all() as SchemaDefinition[];
    assert.equal(hasExpectedSchema(definitions), true);
    assert.equal(hasExpectedSchema(definitions.filter((row) => row.name !== "publications_edit_version")), false);
    assert.equal(hasExpectedSchema([]), false);
  } finally { db.close(); }
});

test("same-millisecond writes still advance the version and reject an old writer", () => {
  const db = migratedDatabase();
  try {
    db.exec("INSERT INTO publications (id,type,title,slug,publication_date,created_at,updated_at) VALUES ('p','legal','Original','original',1000,1000,1000)");
    const update = db.prepare("UPDATE publications SET title = ?, updated_at = 1000 WHERE id = 'p' AND edit_version = ?");
    assert.equal(update.run("Editor A", 0).changes, 1);
    assert.equal(update.run("Stale editor B", 0).changes, 0);
    assert.equal(db.prepare("SELECT edit_version FROM publications").get()?.edit_version, 1);
    assert.equal(db.prepare("SELECT title FROM publications").get()?.title, "Editor A");
  } finally { db.close(); }
});

test("changing scheduled or reviewed body invalidates approval even outside the API", () => {
  const db = migratedDatabase();
  try {
    db.exec("INSERT INTO publications (id,type,title,slug,publication_date,created_at,updated_at,web_body,status,scheduled_at) VALUES ('p','legal','Example','example',1000,1000,1000,'original','scheduled',2000)");
    db.exec("UPDATE publications SET summary = 'New summary' WHERE id = 'p'");
    assert.equal(db.prepare("SELECT status FROM publications").get()?.status, "scheduled");
    db.exec("UPDATE publications SET web_body = 'Changed scheduled body' WHERE id = 'p'");
    assert.deepEqual({ ...db.prepare("SELECT status, scheduled_at FROM publications").get() }, { status: "draft", scheduled_at: null });
    const due = db.prepare("UPDATE publications SET status = 'published' WHERE status = 'scheduled' AND scheduled_at <= 3000");
    assert.equal(due.run().changes, 0);
    db.exec("UPDATE publications SET status = 'review' WHERE id = 'p'");
    db.exec("UPDATE publications SET web_body = 'Changed reviewed body' WHERE id = 'p'");
    assert.equal(db.prepare("SELECT status FROM publications").get()?.status, "draft");
  } finally { db.close(); }
});
