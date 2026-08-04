import assert from "node:assert/strict";
import test from "node:test";
import {
  absoluteSiteUrl,
  publicationSocialImage,
  publicationSocialImagePath,
} from "../lib/seo";
import { normaliseTeamPhotoPath } from "../lib/team-media";

test("team photo paths accept public image assets and reject remote or ambiguous sources", () => {
  assert.equal(normaliseTeamPhotoPath("/team/priya-shah.webp"), "/team/priya-shah.webp");
  assert.equal(normaliseTeamPhotoPath(" /team/Priya Shah.jpg "), "/team/Priya%20Shah.jpg");
  assert.equal(normaliseTeamPhotoPath("https://images.example/priya.jpg"), undefined);
  assert.equal(normaliseTeamPhotoPath("//images.example/priya.jpg"), undefined);
  assert.equal(normaliseTeamPhotoPath("/team/priya.svg"), undefined);
  assert.equal(normaliseTeamPhotoPath("/team/priya.jpg?version=2"), undefined);
  assert.equal(normaliseTeamPhotoPath("/team/../private/priya.jpg"), undefined);
});

test("publication social metadata is stable, report-specific and fully described", () => {
  const publication = {
    slug: "amd-acquisition-zt-systems",
    title: "AMD’s acquisition of ZT Systems",
    type: "strategic" as const,
  };
  assert.equal(
    publicationSocialImagePath(publication),
    "/social/publications/strategic/amd-acquisition-zt-systems",
  );
  assert.deepEqual(publicationSocialImage(publication), {
    url: "/social/publications/strategic/amd-acquisition-zt-systems",
    width: 1200,
    height: 630,
    alt: "AMD’s acquisition of ZT Systems — Strategic Deal Report by M&A Watch",
  });
  assert.equal(
    absoluteSiteUrl("/reports/strategic/amd-acquisition-zt-systems"),
    "https://mawatch.org/reports/strategic/amd-acquisition-zt-systems",
  );
});
