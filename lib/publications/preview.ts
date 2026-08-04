import { publicationRecords } from "./data";
import type { Publication, PublicationType } from "./types";

export interface DraftPreviewAuthorization {
  authenticated: boolean;
  accountStatus: "active" | "disabled" | "invited";
  role: "admin" | "super-user" | "public";
  permissions: readonly string[];
}

export function canAccessDraftPreview(
  authorization: DraftPreviewAuthorization | null | undefined,
): authorization is DraftPreviewAuthorization {
  return Boolean(
    authorization?.authenticated &&
      authorization.accountStatus === "active" &&
      (authorization.role === "admin" || authorization.role === "super-user") &&
      authorization.permissions.includes("publications:preview"),
  );
}

/**
 * This is the only application helper that can return a non-published record.
 * Route handlers must build authorization from the server-side session; never
 * from query-string values or client-supplied role claims.
 */
export function getPublicationForDraftPreview(
  type: PublicationType,
  slug: string,
  authorization: DraftPreviewAuthorization | null | undefined,
): Publication | undefined {
  if (!canAccessDraftPreview(authorization)) return undefined;
  return publicationRecords.find(
    (publication) => publication.type === type && publication.slug === slug,
  );
}
