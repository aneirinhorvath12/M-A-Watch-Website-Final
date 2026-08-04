export const MAX_CV_BYTES = 10 * 1024 * 1024;
export const MAX_PUBLICATION_BYTES = 30 * 1024 * 1024;
export const MAX_CV_MULTIPART_BYTES = MAX_CV_BYTES + 128 * 1024;
export const MAX_PUBLICATION_MULTIPART_BYTES =
  MAX_PUBLICATION_BYTES + 128 * 1024;

export type FileInspection =
  | { ok: true; bytes: ArrayBuffer }
  | { ok: false; error: string };

export type BoundedMultipartFormResult =
  | { ok: true; form: FormData }
  | { ok: false; error: string; status: 400 | 413 };

/**
 * Buffer a multipart request only up to its route-specific envelope limit.
 * Content-Length remains an early rejection hint, never the security boundary:
 * missing and under-reported lengths are still constrained by the stream read.
 */
export async function readBoundedMultipartForm(
  request: Request,
  options: {
    maxBytes: number;
    invalidMessage: string;
    tooLargeMessage: string;
  },
): Promise<BoundedMultipartFormResult> {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1) {
    throw new Error("The multipart request limit is invalid.");
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data(?:\s*;|\s*$)/i.test(contentType)) {
    await cancelRequestBody(request, "Multipart content type is required.");
    return { ok: false, error: options.invalidMessage, status: 400 };
  }

  const declaredHeader = request.headers.get("content-length");
  let declaredLength: number | null = null;
  if (declaredHeader !== null) {
    if (!/^\d+$/.test(declaredHeader.trim())) {
      await cancelRequestBody(request, "Invalid Content-Length.");
      return { ok: false, error: options.invalidMessage, status: 400 };
    }
    declaredLength = Number(declaredHeader);
    if (!Number.isSafeInteger(declaredLength)) {
      await cancelRequestBody(request, "Invalid Content-Length.");
      return { ok: false, error: options.invalidMessage, status: 400 };
    }
    if (declaredLength > options.maxBytes) {
      await cancelRequestBody(request, "Multipart request exceeds the upload limit.");
      return { ok: false, error: options.tooLargeMessage, status: 413 };
    }
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return { ok: false, error: options.invalidMessage, status: 400 };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > options.maxBytes) {
        cancelReader(reader, "Multipart request exceeds the upload limit.");
        return { ok: false, error: options.tooLargeMessage, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    cancelReader(reader, "Multipart request could not be read.");
    return { ok: false, error: options.invalidMessage, status: 400 };
  } finally {
    reader.releaseLock();
  }

  if (declaredLength !== null && declaredLength !== total) {
    return { ok: false, error: options.invalidMessage, status: 400 };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const headers = new Headers(request.headers);
  // Preserve the original multipart Content-Type and boundary. Transport
  // framing headers must be regenerated for the in-memory request body.
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  try {
    const boundedRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: bytes.buffer,
    });
    return { ok: true, form: await boundedRequest.formData() };
  } catch {
    return { ok: false, error: options.invalidMessage, status: 400 };
  }
}

async function cancelRequestBody(request: Request, reason: string): Promise<void> {
  const reader = request.body?.getReader();
  if (!reader) return;
  try {
    cancelReader(reader, reason);
  } finally {
    reader.releaseLock();
  }
}

function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: string,
): void {
  void reader.cancel(reason).catch(() => {
    // The source may already have failed; the request still fails closed and
    // the caller releases its reader lock.
  });
}

export function normalisePublicationPdfFilename(filename: string): string {
  const sanitised = filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.pdf$/i, "")
    .replace(/^\.+|\.+$/g, "")
    .slice(-136);
  return `${sanitised || "source"}.pdf`;
}

export function hasSafeRequestOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return false;
    const fetchSite = request.headers.get("sec-fetch-site");
    return !fetchSite || fetchSite === "same-origin";
  } catch {
    return false;
  }
}

export async function inspectPdf(
  file: File,
  maxBytes: number,
): Promise<FileInspection> {
  if (file.size === 0) return { ok: false, error: "The PDF is empty." };
  if (file.size > maxBytes) {
    return { ok: false, error: "The PDF exceeds the size limit." };
  }
  if (file.type && file.type !== "application/pdf") {
    return { ok: false, error: "Only PDF files are accepted." };
  }

  const bytes = await file.arrayBuffer();
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 8));
  if (!head.startsWith("%PDF-")) {
    return { ok: false, error: "The uploaded file is not a valid PDF." };
  }

  const sample = new TextDecoder("latin1").decode(
    bytes.slice(0, Math.min(bytes.byteLength, 512_000)),
  );
  if (/\/JavaScript\b|\/JS\b|\/Launch\b|\/EmbeddedFile\b/i.test(sample)) {
    return {
      ok: false,
      error: "This PDF contains active or embedded content and cannot be accepted.",
    };
  }
  return { ok: true, bytes };
}

export function cleanPlainText(
  value: FormDataEntryValue | null,
  maxLength: number,
): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
