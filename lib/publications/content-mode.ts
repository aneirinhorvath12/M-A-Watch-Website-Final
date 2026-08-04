export const PUBLICATION_CONTENT_MODES = ["managed", "demo"] as const;

export type PublicationContentMode = (typeof PUBLICATION_CONTENT_MODES)[number];

/**
 * Public publication data is managed by D1 unless a local or preview
 * environment explicitly opts into the demonstration catalogue. Unknown and
 * missing values deliberately resolve to the production-safe mode.
 */
export function resolvePublicationContentMode(value: unknown): PublicationContentMode {
  return typeof value === "string" && value.trim().toLowerCase() === "demo"
    ? "demo"
    : "managed";
}
