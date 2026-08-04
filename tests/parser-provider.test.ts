import assert from "node:assert/strict";
import test from "node:test";
import { resolveParserProvider } from "../lib/parser/provider";

const adobe = {
  ADOBE_PDF_SERVICES_CLIENT_ID: "adobe-client-id",
  ADOBE_PDF_SERVICES_CLIENT_SECRET: "adobe-client-secret",
  ADOBE_PDF_SERVICES_REGION: "eu",
} as const;

test("partial or invalid parser webhooks never shadow valid Adobe credentials", () => {
  assert.equal(
    resolveParserProvider({ ...adobe, PARSER_WEBHOOK_URL: "https://parser.example/extract" })?.kind,
    "adobe",
  );
  assert.equal(
    resolveParserProvider({
      ...adobe,
      PARSER_WEBHOOK_URL: "http://parser.example/extract",
      PARSER_WEBHOOK_TOKEN: "secret",
    })?.kind,
    "adobe",
  );
});

test("a complete secure parser webhook has explicit precedence", () => {
  assert.deepEqual(
    resolveParserProvider({
      ...adobe,
      PARSER_WEBHOOK_URL: "https://parser.example/extract",
      PARSER_WEBHOOK_TOKEN: " webhook-secret ",
    }),
    {
      kind: "webhook",
      endpoint: "https://parser.example/extract",
      token: "webhook-secret",
    },
  );
});
