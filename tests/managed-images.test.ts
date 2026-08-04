import assert from "node:assert/strict";
import test from "node:test";
import {
  articleReferencesManagedImage,
  createPublicationCoverReference,
  infoAssetKey,
  infoAssetPath,
  infoImageAssetIds,
  inspectManagedImage,
  managedPublicationImagePath,
  parseInfoAssetPath,
  parsePublicationCoverReference,
  publicationCoverFromStored,
  publicationCoverKey,
  readBoundedImageForm,
  MAX_MANAGED_IMAGE_MULTIPART_BYTES,
} from "../lib/managed-images";

const publicationId = "publication_123e4567-e89b-42d3-a456-426614174000";
const assetId = "123e4567-e89b-42d3-a456-426614174001.png";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("managed image inspection derives dimensions from complete server-decoded bytes", async () => {
  const inspected = await inspectManagedImage(
    new File([png], "cover.png", { type: "image/png" }),
  );
  assert.deepEqual(
    { contentType: inspected.contentType, extension: inspected.extension, width: inspected.width, height: inspected.height },
    { contentType: "image/png", extension: "png", width: 1, height: 1 },
  );
  await assert.rejects(
    () => inspectManagedImage(new File([png.subarray(0, 33)], "cover.png", { type: "image/png" })),
    /invalid|dimensions/i,
  );
});

test("publication covers are structured, bounded and publication-scoped", async () => {
  const image = await inspectManagedImage(new File([png], "cover.png", { type: "image/png" }));
  const reference = createPublicationCoverReference(assetId, "A blue acquisition report cover", image);
  const stored = JSON.stringify(reference);
  assert.deepEqual(parsePublicationCoverReference(stored), reference);
  assert.equal(publicationCoverKey(publicationId, assetId), `private/publication-covers/${publicationId}/${assetId}`);
  assert.deepEqual(publicationCoverFromStored(stored, "safe-slug"), {
    src: `/api/publications/safe-slug/cover/${assetId}`,
    alt: "A blue acquisition report cover",
    width: 1,
    height: 1,
  });
  assert.equal(parsePublicationCoverReference(JSON.stringify({ ...reference, width: 100_000 })), null);
  assert.equal(parsePublicationCoverReference("private/publication-covers/leak.png"), null);
});

test("article and Info references are exact managed routes rather than string fragments", () => {
  const src = managedPublicationImagePath(publicationId, assetId);
  assert.ok(src);
  assert.equal(articleReferencesManagedImage(
    JSON.stringify([{ type: "image", src }]),
    publicationId,
    "report-slug",
    assetId,
  ), true);
  assert.equal(articleReferencesManagedImage(
    JSON.stringify([{ type: "paragraph", text: assetId }]),
    publicationId,
    "report-slug",
    assetId,
  ), false);

  const infoPath = infoAssetPath(assetId);
  assert.ok(infoPath);
  assert.equal(parseInfoAssetPath(infoPath ?? ""), assetId);
  assert.equal(infoAssetKey(assetId), `private/site-assets/info/${assetId}`);
  assert.deepEqual(
    [...infoImageAssetIds({ blocks: [{ type: "image", src: infoPath, alt: "Alt", caption: "" }] })],
    [assetId],
  );
});

test("managed multipart reads are bounded even without a truthful length header", async () => {
  const declared = await readBoundedImageForm(new Request("https://mawatch.example/upload", {
    method: "POST",
    headers: {
      "content-type": "multipart/form-data; boundary=x",
      "content-length": String(MAX_MANAGED_IMAGE_MULTIPART_BYTES + 1),
    },
    body: "--x--",
  }));
  assert.equal(declared.ok, false);
  if (!declared.ok) assert.equal(declared.status, 413);

  let remaining = 6;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!remaining) return controller.close();
      remaining -= 1;
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
  });
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x" },
    body: stream,
    duplex: "half",
  };
  const streamed = await readBoundedImageForm(new Request("https://mawatch.example/upload", init));
  assert.equal(streamed.ok, false);
  if (!streamed.ok) assert.equal(streamed.status, 413);
});
