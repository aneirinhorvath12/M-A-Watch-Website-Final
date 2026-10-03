/** Require the revision actually loaded by the editor, not a request-time read. */
export function matchesPublicationVersion(value: unknown, current: number): boolean {
  if (typeof value === "string" && !/^(0|[1-9]\d*)$/.test(value)) return false;
  if (typeof value !== "string" && typeof value !== "number") return false;
  const version = Number(value);
  return Number.isSafeInteger(version) && version >= 0 && version === current;
}

export const PUBLICATION_CONFLICT =
  "This publication has changed since you loaded it. Your unsaved text is still in this page. Copy any changes you want to keep, then reload and compare with the latest version.";
