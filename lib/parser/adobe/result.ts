import type { ParserInput, ParserResult } from "@/lib/parser/contract";
import { runParserPrototype } from "@/lib/parser/prototype";
import type { AdobeExtractCompletion } from "./client";

/** Apply the shared fail-closed validation and retain the Adobe parser version. */
export function adobeCompletionToParserResult(
  input: ParserInput,
  completion: AdobeExtractCompletion,
  completedAt = new Date().toISOString(),
): ParserResult {
  return {
    ...runParserPrototype(input, completion.extraction, completedAt),
    parserVersion: completion.parserVersion,
  };
}
