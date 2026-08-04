import assert from "node:assert/strict";
import test from "node:test";
import {
  actionablePublicationWarnings,
  LEGACY_SOURCE_WORKFLOW_MESSAGES,
  manualRecoveryWarning,
  publicationWarningMessage,
} from "../lib/publication-warnings";

test("source processing status is not presented as an editorial parser warning", () => {
  const stored = JSON.stringify([
    LEGACY_SOURCE_WORKFLOW_MESSAGES[0],
    LEGACY_SOURCE_WORKFLOW_MESSAGES[1],
    "A table needs editorial review.",
    { code: "LOW_CONFIDENCE", message: "Check the purchase price." },
  ]);

  assert.deepEqual(actionablePublicationWarnings(stored), [
    "A table needs editorial review.",
    { code: "LOW_CONFIDENCE", message: "Check the purchase price." },
  ]);
});

test("manual parser recovery creates a durable editorial warning", () => {
  const warning = manualRecoveryWarning();

  assert.equal(
    publicationWarningMessage(warning),
    "Automatic extraction did not produce a complete draft. Compare the manually edited article with the source PDF before marking warnings reviewed.",
  );
  assert.deepEqual(actionablePublicationWarnings(JSON.stringify([warning])), [
    warning,
  ]);
});

test("malformed parser warning entries fail closed as editorial warnings", () => {
  const warnings = actionablePublicationWarnings(
    JSON.stringify([null, 42, false]),
  );

  assert.equal(warnings.length, 3);
  for (const warning of warnings) {
    assert.match(publicationWarningMessage(warning), /unreadable warning/i);
  }
});
