import { validatedIntegrationUrl } from "@/lib/integration-security";
import {
  resolveAdobeParserConfig,
  type AdobeParserConfig,
  type AdobeParserEnv,
} from "./adobe";

export type ParserProviderEnv = AdobeParserEnv & {
  PARSER_WEBHOOK_URL?: string;
  PARSER_WEBHOOK_TOKEN?: string;
};

export type ParserProviderConfig =
  | { kind: "webhook"; endpoint: string; token: string }
  | { kind: "adobe"; config: AdobeParserConfig }
  | null;

/**
 * Resolve exactly one parser provider. A webhook is usable only as a complete,
 * validated URL/token pair; stale partial webhook settings must never shadow a
 * valid direct Adobe configuration.
 */
export function resolveParserProvider(
  runtime: ParserProviderEnv,
  options: { allowLoopbackHttp?: boolean } = {},
): ParserProviderConfig {
  const token = runtime.PARSER_WEBHOOK_TOKEN?.trim();
  const endpoint = runtime.PARSER_WEBHOOK_URL?.trim();
  const validatedEndpoint = endpoint
    ? validatedIntegrationUrl(endpoint, options)
    : null;
  if (validatedEndpoint && token) {
    return { kind: "webhook", endpoint: validatedEndpoint, token };
  }

  const adobe = resolveAdobeParserConfig(runtime);
  return adobe ? { kind: "adobe", config: adobe } : null;
}
