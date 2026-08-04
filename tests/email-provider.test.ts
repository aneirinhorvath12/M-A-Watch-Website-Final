import assert from "node:assert/strict";
import test from "node:test";
import {
  emailProviderRequestBody,
  resolveEmailProvider,
  type RenderedEmailPayload,
} from "../lib/email-provider";

const payload: RenderedEmailPayload = {
  to: ["editor@example.org"],
  subject: "M&A Watch update",
  text: "The publication is ready.",
  template: "publication-ready",
  data: { publicationId: "pub_1" },
};

test("custom email webhooks retain the complete template payload", () => {
  const provider = resolveEmailProvider({
    EMAIL_WEBHOOK_URL: "https://mail.example.org/deliver",
    EMAIL_WEBHOOK_TOKEN: "webhook-secret",
    RESEND_API_KEY: "re_ignored",
    EMAIL_FROM: "M&A Watch <updates@example.org>",
  });

  assert.deepEqual(provider, {
    kind: "webhook",
    endpoint: "https://mail.example.org/deliver",
    token: "webhook-secret",
  });
  assert.deepEqual(emailProviderRequestBody(provider!, payload), payload);
});

test("Resend is available without a separate adapter service", () => {
  const provider = resolveEmailProvider({
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "M&A Watch <updates@example.org>",
  });

  assert.equal(provider?.kind, "resend");
  assert.deepEqual(emailProviderRequestBody(provider!, payload), {
    from: "M&A Watch <updates@example.org>",
    to: ["editor@example.org"],
    subject: "M&A Watch update",
    text: "The publication is ready.",
  });
});

test("partial Resend configuration fails closed", () => {
  assert.equal(resolveEmailProvider({ RESEND_API_KEY: "re_test_key" }), null);
  assert.equal(
    resolveEmailProvider({ EMAIL_FROM: "updates@example.org" }),
    null,
  );
});

test("partial or insecure webhook settings do not shadow complete Resend settings", () => {
  for (const webhook of [
    { EMAIL_WEBHOOK_URL: "https://mail.example.org/deliver" },
    {
      EMAIL_WEBHOOK_URL: "http://mail.example.org/deliver",
      EMAIL_WEBHOOK_TOKEN: "webhook-secret",
    },
  ]) {
    const provider = resolveEmailProvider({
      ...webhook,
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "M&A Watch <updates@example.org>",
    });
    assert.equal(provider?.kind, "resend");
  }
});
