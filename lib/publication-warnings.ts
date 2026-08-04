export const LEGACY_SOURCE_WORKFLOW_MESSAGES = [
  "Extraction will begin after the source file passes the configured malware scan.",
  "Replacement extraction is waiting for the source file security scan. Prior editorial content has been preserved.",
] as const;

const LEGACY_SOURCE_WORKFLOW_MESSAGE_SET = new Set<string>(
  LEGACY_SOURCE_WORKFLOW_MESSAGES,
);

export type PublicationWarning =
  | string
  | {
      code?: string;
      severity?: string;
      message?: string;
      requiresEditorialReview?: boolean;
      [key: string]: unknown;
    };

export function actionablePublicationWarnings(
  stored: string | null | undefined,
): PublicationWarning[] {
  if (!stored) return [];
  try {
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) return [];
    return value
      .map((warning): PublicationWarning =>
        isPublicationWarning(warning)
          ? warning
          : {
              code: "MALFORMED_PARSER_WARNING",
              severity: "warning",
              message:
                "The parser returned an unreadable warning. Compare the article with the source PDF before marking warnings reviewed.",
              requiresEditorialReview: true,
            },
      )
      .filter(
        (warning) =>
          !LEGACY_SOURCE_WORKFLOW_MESSAGE_SET.has(
            publicationWarningMessage(warning),
          ),
      );
  } catch {
    return [];
  }
}

export function publicationWarningMessage(warning: PublicationWarning): string {
  if (typeof warning === "string") return warning;
  return typeof warning.message === "string" && warning.message.trim()
    ? warning.message
    : "An editorial warning needs review.";
}

export function manualRecoveryWarning(): PublicationWarning {
  return {
    code: "MANUAL_PARSER_RECOVERY",
    severity: "warning",
    message:
      "Automatic extraction did not produce a complete draft. Compare the manually edited article with the source PDF before marking warnings reviewed.",
    requiresEditorialReview: true,
  };
}

function isPublicationWarning(value: unknown): value is PublicationWarning {
  return (
    typeof value === "string" ||
    Boolean(value && typeof value === "object" && !Array.isArray(value))
  );
}
