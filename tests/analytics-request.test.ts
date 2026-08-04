import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedUtf8Body } from "../lib/analytics-request";

function openBody(bytes: number) {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes).fill(97));
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, wasCancelled: () => cancelled };
}

test("bounded analytics body reading cancels on byte 513", async () => {
  const body = openBody(513);
  assert.deepEqual(await readBoundedUtf8Body(body.stream, 512), {
    ok: false,
    tooLarge: true,
  });
  assert.equal(body.wasCancelled(), true);
  assert.equal(body.stream.locked, false);
});

test("bounded analytics body reading accepts exactly 512 bytes", async () => {
  const source = new TextEncoder().encode("a".repeat(512));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(source.subarray(0, 256));
      controller.enqueue(source.subarray(256));
      controller.close();
    },
  });
  assert.deepEqual(await readBoundedUtf8Body(stream, 512), {
    ok: true,
    text: "a".repeat(512),
  });
  assert.equal(stream.locked, false);
});

test("a short absolute deadline cancels and unlocks a body that never closes", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"event":'));
    },
    cancel() {
      cancelled = true;
    },
  });

  assert.deepEqual(
    await readBoundedUtf8Body(stream, 512, { deadlineMs: 10 }),
    { ok: false, tooLarge: false, timedOut: true },
  );
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});
