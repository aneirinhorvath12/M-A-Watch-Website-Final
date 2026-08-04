import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the protected maintenance fallback runs on a bounded recurring schedule", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/maintenance.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(workflow, /secrets\.MAINTENANCE_ENDPOINT/);
  assert.match(workflow, /secrets\.MAINTENANCE_TOKEN/);
  assert.match(workflow, /Authorization: Bearer \$\{MAINTENANCE_TOKEN\}/);
  assert.match(workflow, /\/api\/maintenance\$/);
  assert.match(workflow, /--fail-with-body/);
  assert.doesNotMatch(workflow, /pull_request|push:/);
});
