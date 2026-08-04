import assert from "node:assert/strict";
import test from "node:test";
import {
  getFeaturedPublications,
  getPublicPublication,
  getPublishedPublications,
  searchPublishedPublications,
} from "../lib/publications/service";
import {
  canAccessDraftPreview,
  getPublicationForDraftPreview,
} from "../lib/publications/preview";

test("public helpers return only enabled, published records", () => {
  const publications = getPublishedPublications();
  assert.ok(publications.length > 0);
  assert.ok(
    publications.every(
      (publication) =>
        publication.status === "published" && publication.visibility === "enabled",
    ),
  );
  assert.equal(
    getPublicPublication("strategic", "european-infrastructure-autumn-outlook"),
    undefined,
  );
  assert.equal(
    getPublicPublication("legal", "warranty-indemnity-insurance-editorial-draft"),
    undefined,
  );
});

test("search and featured results cannot leak scheduled or review content", () => {
  const scheduled = searchPublishedPublications({ q: "scheduled editorial package" });
  const review = searchPublishedPublications({ q: "unpublished draft" });
  assert.equal(scheduled.total, 0);
  assert.equal(review.total, 0);
  assert.ok(
    getFeaturedPublications(20).every(
      (publication) => publication.status === "published",
    ),
  );
});

test("draft preview requires an active privileged server-side grant", () => {
  const grant = {
    authenticated: true,
    accountStatus: "active" as const,
    role: "admin" as const,
    permissions: ["publications:preview"],
  };
  assert.equal(canAccessDraftPreview(grant), true);
  assert.equal(
    getPublicationForDraftPreview(
      "legal",
      "warranty-indemnity-insurance-editorial-draft",
      grant,
    )?.status,
    "review",
  );
  assert.equal(
    getPublicationForDraftPreview(
      "legal",
      "warranty-indemnity-insurance-editorial-draft",
      { ...grant, accountStatus: "disabled" },
    ),
    undefined,
  );
});
