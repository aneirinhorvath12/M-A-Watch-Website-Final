import assert from "node:assert/strict";
import test from "node:test";
import { claimScopedImageId } from "../lib/job-assets";

test("recovered job claims stage identical figures under disjoint keys", async () => {
  const bytes = new TextEncoder().encode("same extracted figure");
  const oldClaim = await claimScopedImageId(
    "job_parse_123",
    "claim-old",
    bytes,
  );
  const replacementClaim = await claimScopedImageId(
    "job_parse_123",
    "claim-replacement",
    bytes,
  );

  assert.match(oldClaim, /^[0-9a-f-]{36}$/);
  assert.notEqual(oldClaim, replacementClaim);
  assert.equal(
    await claimScopedImageId("job_parse_123", "claim-old", bytes),
    oldClaim,
  );

  const stagedByOldWorker = new Set([oldClaim]);
  assert.equal(
    stagedByOldWorker.has(replacementClaim),
    false,
    "expired-worker cleanup must not target the replacement claim's figure",
  );
});
