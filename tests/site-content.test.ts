import assert from "node:assert/strict";
import test from "node:test";
import {
  coerceManagedContent,
  DEFAULT_HOMEPAGE_EDITORIAL,
  DEFAULT_HOMEPAGE_HERO,
  DEFAULT_INFO_PAGE,
  DEFAULT_SITE_CONTACT,
  isSafeContentHref,
  isSafeContentImageSource,
  isSafeSocialHref,
  validateManagedContent,
} from "../lib/site-content";

test("all managed content defaults pass the same strict validation used by publishing", () => {
  assert.equal(validateManagedContent("homepage.hero", DEFAULT_HOMEPAGE_HERO).ok, true);
  assert.equal(validateManagedContent("homepage.editorial", DEFAULT_HOMEPAGE_EDITORIAL).ok, true);
  assert.equal(validateManagedContent("info.page", DEFAULT_INFO_PAGE).ok, true);
  assert.equal(validateManagedContent("site.contact", DEFAULT_SITE_CONTACT).ok, true);
});

test("managed links accept only bounded site paths and HTTPS destinations", () => {
  assert.equal(isSafeContentHref("/reports/strategic?year=2026"), true);
  assert.equal(isSafeContentHref("https://www.linkedin.com/company/ma-watch"), true);
  assert.equal(isSafeContentHref("//attacker.example/path"), false);
  assert.equal(isSafeContentHref("http://example.com"), false);
  assert.equal(isSafeContentHref("javascript:alert(1)"), false);
  assert.equal(isSafeContentHref("/safe\\redirect"), false);
  assert.equal(isSafeSocialHref("/team"), false);
  assert.equal(isSafeSocialHref("https://instagram.com/mawatch"), true);
});

test("Info images require a safe image source and meaningful alternative text", () => {
  assert.equal(isSafeContentImageSource("/brand/logo-black-mark.png"), true);
  assert.equal(isSafeContentImageSource("https://images.example.test/event.webp?v=2"), false);
  assert.equal(isSafeContentImageSource("https://images.example.test/vector.svg"), false);
  assert.equal(isSafeContentImageSource("data:image/png;base64,abc"), false);

  const missingAlt = {
    ...DEFAULT_INFO_PAGE,
    blocks: [{ type: "image", src: "/og.png", alt: "", caption: "" }],
  };
  const result = validateManagedContent("info.page", missingAlt);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /alternative text/i);

  const assetId = "123e4567-e89b-42d3-a456-426614174001.png";
  const managedWithoutServerDimensions = validateManagedContent("info.page", {
    ...DEFAULT_INFO_PAGE,
    blocks: [{ type: "image", src: `/api/content/info/assets/${assetId}`, alt: "A research meeting", caption: "" }],
  });
  assert.equal(managedWithoutServerDimensions.ok, false);
  const managed = validateManagedContent("info.page", {
    ...DEFAULT_INFO_PAGE,
    blocks: [{ type: "image", src: `/api/content/info/assets/${assetId}`, alt: "A research meeting", caption: "", width: 1600, height: 900 }],
  });
  assert.equal(managed.ok, true);
});

test("Info content rejects unsupported HTML blocks and enforces its cardinality bound", () => {
  const arbitraryHtml = {
    ...DEFAULT_INFO_PAGE,
    blocks: [{ type: "html", value: "<script>alert(1)</script>" }],
  };
  const unsupported = validateManagedContent("info.page", arbitraryHtml);
  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) assert.match(unsupported.error, /unsupported type/i);

  const tooMany = {
    ...DEFAULT_INFO_PAGE,
    blocks: Array.from({ length: 19 }, () => ({ type: "paragraph", text: "Bounded content" })),
  };
  const bounded = validateManagedContent("info.page", tooMany);
  assert.equal(bounded.ok, false);
  if (!bounded.ok) assert.match(bounded.error, /between 1 and 18/i);
});

test("footer social links are HTTPS-only and capped at six", () => {
  const insecure = validateManagedContent("site.contact", {
    ...DEFAULT_SITE_CONTACT,
    socialLinks: [{ label: "Example", href: "http://example.com" }],
  });
  assert.equal(insecure.ok, false);
  if (!insecure.ok) assert.match(insecure.error, /HTTPS URL/i);

  const oversized = validateManagedContent("site.contact", {
    ...DEFAULT_SITE_CONTACT,
    socialLinks: Array.from({ length: 7 }, (_, index) => ({
      label: `Channel ${index + 1}`,
      href: `https://social.example.test/${index + 1}`,
    })),
  });
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.match(oversized.error, /no more than 6/i);
});

test("legacy simple Info and footer records receive safe structured defaults", () => {
  const info = coerceManagedContent("info.page", {
    title: "Legacy title",
    body: "Legacy introduction",
  });
  assert.equal("title" in info ? info.title : "", "Legacy title");
  assert.equal("blocks" in info && Array.isArray(info.blocks), true);

  const contact = coerceManagedContent("site.contact", {
    body: "Legacy footer",
    ctaLabel: "Contact us",
    ctaHref: "mailto:editors@mawatch.org",
  });
  assert.equal("email" in contact ? contact.email : "", "editors@mawatch.org");
  assert.equal("socialLinks" in contact && contact.socialLinks.length, 0);
});
