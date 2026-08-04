export type BoundedBodyResult =
  | { ok: true; text: string }
  | { ok: false; tooLarge: boolean; timedOut?: boolean };

type BoundedBodyOptions = { deadlineMs?: number };

// Kept internal: callers cannot select a deadline through an HTTP header,
// query parameter or environment value.
const DEFAULT_READ_DEADLINE_MS = 2_000;

/**
 * Read a UTF-8 request stream without ever buffering more than the supplied
 * byte limit. The reader is cancelled immediately when the first excess byte
 * arrives, independent of any Content-Length claim.
 */
export async function readBoundedUtf8Body(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  options: BoundedBodyOptions = {},
): Promise<BoundedBodyResult> {
  if (!stream) return { ok: true, text: "" };
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new Error("The request body limit is invalid.");
  }
  const deadlineMs = options.deadlineMs ?? DEFAULT_READ_DEADLINE_MS;
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    throw new Error("The request body deadline is invalid.");
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ kind: "deadline" }>((resolve) => {
    deadlineTimer = setTimeout(() => resolve({ kind: "deadline" }), deadlineMs);
  });
  try {
    while (true) {
      const outcome = await Promise.race([
        reader.read().then((result) => ({ kind: "read" as const, result })),
        deadline,
      ]);
      if (outcome.kind === "deadline") {
        cancelReader(reader, "Request body read deadline exceeded.");
        return { ok: false, tooLarge: false, timedOut: true };
      }
      const { done, value } = outcome.result;
      if (done) {
        return { ok: true, text: text + decoder.decode() };
      }
      received += value.byteLength;
      if (received > maxBytes) {
        cancelReader(reader, "Request exceeded the byte limit.");
        return { ok: false, tooLarge: true };
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    cancelReader(reader, "Request could not be read.");
    return { ok: false, tooLarge: false };
  } finally {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    reader.releaseLock();
  }
}

function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: string,
): void {
  void reader.cancel(reason).catch(() => {
    // The source may already have failed or closed; the reader is still
    // released by the caller's finally block.
  });
}
