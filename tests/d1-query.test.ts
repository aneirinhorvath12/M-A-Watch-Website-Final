import assert from "node:assert/strict";
import test from "node:test";
import { d1LikePattern } from "../lib/d1-query";

test("D1 LIKE patterns escape wildcards and remain below the platform limit", () => {
  assert.equal(d1LikePattern("100%_match"), "%100\\%\\_match%");
  for (const input of ["x".repeat(160), "£".repeat(100), "😀".repeat(100), "%".repeat(100)]) {
    const pattern = d1LikePattern(input);
    assert.ok(new TextEncoder().encode(pattern).byteLength <= 48);
  }
});
