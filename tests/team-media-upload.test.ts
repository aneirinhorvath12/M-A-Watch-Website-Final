import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectTeamPhoto,
  isValidLinkedInUrl,
  managedTeamPhotoKey,
  managedTeamPhotoPath,
  MAX_TEAM_MEMBER_MULTIPART_BYTES,
  readTeamMemberRequest,
} from "../lib/team-media";

test("team social links accept only credential-free HTTPS LinkedIn URLs", () => {
  assert.equal(isValidLinkedInUrl(""), true);
  assert.equal(isValidLinkedInUrl("https://www.linkedin.com/in/example"), true);
  assert.equal(isValidLinkedInUrl("https://uk.linkedin.com/company/example"), true);
  assert.equal(isValidLinkedInUrl("http://www.linkedin.com/in/example"), false);
  assert.equal(isValidLinkedInUrl("https://example.com/in/example"), false);
  assert.equal(isValidLinkedInUrl("https://linkedin.com.evil.example/in/example"), false);
  assert.equal(isValidLinkedInUrl("https://user:pass@linkedin.com/in/example"), false);
});

const memberId = "team_123e4567-e89b-12d3-a456-426614174000";
const assetId = "123e4567-e89b-12d3-a456-426614174001.png";

const VALID_PNG = fixture(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
);
const VALID_JPEG = fixture(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==",
);
const VALID_WEBP = fixture(
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJQBOgCHwAP7+",
);

test("managed team image paths remain member-scoped", () => {
  const path = managedTeamPhotoPath(memberId, assetId);
  assert.equal(path, `/api/team/images/${memberId}/${assetId}`);
  assert.equal(
    managedTeamPhotoKey(path ?? ""),
    `private/team-assets/${memberId}/${assetId}`,
  );
  assert.equal(managedTeamPhotoPath("team_bad", assetId), null);
  assert.equal(managedTeamPhotoKey(`/api/team/images/${memberId}/../cv.pdf`), null);
});

test("team upload inspection accepts complete, decodable fixture files", async () => {
  const fixtures = [
    { bytes: VALID_PNG, name: "portrait.png", type: "image/png", extension: "png" },
    { bytes: VALID_JPEG, name: "portrait.jpg", type: "image/jpeg", extension: "jpg" },
    { bytes: VALID_WEBP, name: "portrait.webp", type: "image/webp", extension: "webp" },
  ] as const;
  for (const item of fixtures) {
    const inspected = await inspectTeamPhoto(
      new File([item.bytes], item.name, { type: item.type }),
    );
    assert.deepEqual(
      {
        contentType: inspected.contentType,
        extension: inspected.extension,
        width: inspected.width,
        height: inspected.height,
      },
      { contentType: item.type, extension: item.extension, width: 1, height: 1 },
    );
  }
});

test("team upload inspection rejects header-only, truncated and corrupt images", async () => {
  const invalidFiles = [
    new File([VALID_PNG.slice(0, 33)], "header-only.png", { type: "image/png" }),
    new File([VALID_JPEG.slice(0, 120)], "header-only.jpg", { type: "image/jpeg" }),
    new File([VALID_WEBP.slice(0, 30)], "header-only.webp", { type: "image/webp" }),
    new File([VALID_PNG.slice(0, -1)], "truncated.png", { type: "image/png" }),
    new File([VALID_JPEG.slice(0, -1)], "truncated.jpg", { type: "image/jpeg" }),
    new File([VALID_WEBP.slice(0, -1)], "truncated.webp", { type: "image/webp" }),
    new File([corrupt(VALID_PNG, 45)], "corrupt.png", { type: "image/png" }),
    new File([corrupt(VALID_JPEG, 23)], "corrupt.jpg", { type: "image/jpeg" }),
    new File([corrupt(VALID_WEBP, 23)], "corrupt.webp", { type: "image/webp" }),
  ];
  for (const file of invalidFiles) {
    await assert.rejects(() => inspectTeamPhoto(file), /invalid|dimensions are too large/i);
  }

  await assert.rejects(
    () => inspectTeamPhoto(new File([VALID_PNG], "wrong.jpg", { type: "image/jpeg" })),
    /invalid/i,
  );
});

test("team multipart requests keep files separate from plain fields", async () => {
  const form = new FormData();
  form.set("name", "Aneirin Example");
  form.set(
    "photo",
    new File([VALID_PNG], "portrait.png", { type: "image/png" }),
  );
  const result = await readTeamMemberRequest(
    new Request("https://mawatch.example/api/admin/team", {
      method: "POST",
      body: form,
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.payload.name, "Aneirin Example");
  assert.equal(result.value.photo?.name, "portrait.png");
  assert.equal("photo" in result.value.payload, false);
});

test("multipart size limits reject declared, missing and false Content-Length values before parsing", async () => {
  const declared = await readTeamMemberRequest(
    new Request("https://mawatch.example/api/admin/team", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=upload",
        "content-length": String(MAX_TEAM_MEMBER_MULTIPART_BYTES + 1),
      },
      body: "--upload--",
    }),
  );
  assert.deepEqual(
    declared.ok ? null : { status: declared.status, error: declared.error },
    { status: 413, error: "The team member upload is too large. Photographs may be up to 5 MB." },
  );

  for (const contentLength of [undefined, "1"] as const) {
    const streamed = await readTeamMemberRequest(oversizedStreamingRequest(contentLength));
    assert.equal(streamed.ok, false);
    if (!streamed.ok) {
      assert.equal(streamed.status, 413);
      assert.match(streamed.error, /up to 5 MB/i);
    }
  }
});

function fixture(base64: string): ArrayBuffer {
  const source = Buffer.from(base64, "base64");
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  return bytes.buffer;
}

function corrupt(source: ArrayBuffer, index: number): ArrayBuffer {
  const bytes = new Uint8Array(source.slice(0));
  bytes[index] ^= 0x01;
  return bytes.buffer;
}

function oversizedStreamingRequest(contentLength?: string): Request {
  let remaining = 6;
  const chunk = new Uint8Array(1024 * 1024);
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (remaining === 0) {
        controller.close();
        return;
      }
      remaining -= 1;
      controller.enqueue(chunk);
    },
  });
  const headers = new Headers({
    "content-type": "multipart/form-data; boundary=upload",
  });
  if (contentLength) headers.set("content-length", contentLength);
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers,
    body,
    duplex: "half",
  };
  return new Request("https://mawatch.example/api/admin/team", init);
}
