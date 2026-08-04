import { validatedIntegrationUrl } from "@/lib/integration-security";

export type EmailProviderSecrets = {
  EMAIL_WEBHOOK_URL?: string;
  EMAIL_WEBHOOK_TOKEN?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
};

export type EmailProviderConfig =
  | {
      kind: "webhook";
      endpoint: string;
      token: string;
    }
  | {
      kind: "resend";
      endpoint: "https://api.resend.com/emails";
      token: string;
      from: string;
    };

export type RenderedEmailPayload = {
  to: string[];
  subject: string;
  text: string;
  template: string;
  data: Record<string, string>;
};

/** Prefer the existing generic adapter, while supporting Resend directly. */
export function resolveEmailProvider(
  secrets: EmailProviderSecrets,
  options: { allowLoopbackHttp?: boolean } = {},
): EmailProviderConfig | null {
  const webhookUrl = secrets.EMAIL_WEBHOOK_URL?.trim();
  const token = secrets.EMAIL_WEBHOOK_TOKEN?.trim();
  const endpoint = webhookUrl
    ? validatedIntegrationUrl(webhookUrl, options)
    : null;
  if (endpoint && token) {
    return {
      kind: "webhook",
      endpoint,
      token,
    };
  }

  const apiKey = secrets.RESEND_API_KEY?.trim();
  const from = secrets.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;

  return {
    kind: "resend",
    endpoint: "https://api.resend.com/emails",
    token: apiKey,
    from,
  };
}

export function emailProviderRequestBody(
  provider: EmailProviderConfig,
  payload: RenderedEmailPayload,
): RenderedEmailPayload | {
  from: string;
  to: string[];
  subject: string;
  text: string;
} {
  if (provider.kind === "webhook") return payload;
  return {
    from: provider.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
  };
}
