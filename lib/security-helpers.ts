import { inflateSync, unzlibSync } from "fflate";
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

  if (pdfContainsActiveContent(new Uint8Array(bytes))) {
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

const ACTIVE_PDF_NAME = /\/(?:JavaScript|JS|Launch|EmbeddedFile)(?![A-Za-z0-9])/i;
const PDF_SCAN_CHUNK = 1024 * 1024;
const PDF_SCAN_OVERLAP = 64;
const MAX_OBJECT_STREAMS = 2_000;
const MAX_INFLATED_OBJECT_STREAM_BYTES = 32 * 1024 * 1024;

/** Decode PDF name escapes such as `/J#61vaScript` before matching. */
function normalisePdfNames(text: string): string {
  return text.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/**
 * Scan every part of the PDF's object structure (outside stream data, which
 * is arbitrary binary and would cause false positives), plus the decompressed
 * contents of object streams (/ObjStm), where PDF 1.5+ writers commonly place
 * dictionaries such as /OpenAction. Text is decoded segment by segment so a
 * large upload is never duplicated into one string.
 */
export function pdfContainsActiveContent(bytes: Uint8Array): boolean {
  const decoder = new TextDecoder("latin1");
  let cursor = 0;
  let objectStreams = 0;
  let inflatedTotal = 0;
  while (cursor < bytes.byteLength) {
    const streamKeyword = findStreamKeyword(bytes, cursor);
    const segmentEnd = streamKeyword < 0 ? bytes.byteLength : streamKeyword;
    if (segmentContainsActiveName(bytes, cursor, segmentEnd, decoder)) return true;
    if (streamKeyword < 0) return false;

    let dataStart = streamKeyword + STREAM.length;
    if (bytes[dataStart] === 0x0d) dataStart += 1;
    if (bytes[dataStart] === 0x0a) dataStart += 1;
    const dataEnd = indexOfBytes(bytes, ENDSTREAM, dataStart);
    if (dataEnd < 0) return false;

    const dictionaryStart = Math.max(cursor, streamKeyword - 4096);
    const dictionary = decoder.decode(bytes.subarray(dictionaryStart, streamKeyword));
    const objIndex = dictionary.lastIndexOf(" obj");
    const ownDictionary = objIndex >= 0 ? dictionary.slice(objIndex) : dictionary;
    if (/\/Type\s*\/ObjStm(?![A-Za-z0-9])/.test(ownDictionary)) {
      if (++objectStreams > MAX_OBJECT_STREAMS) return true;
      const data = bytes.subarray(dataStart, dataEnd);
      if (!/\/Filter(?![A-Za-z0-9])/.test(ownDictionary)) {
        if (segmentContainsActiveName(data, 0, data.byteLength, decoder)) return true;
      } else if (/\/FlateDecode(?![A-Za-z0-9])/.test(ownDictionary)) {
        const inflated = inflatePdfStream(data);
        if (!inflated) return true;
        inflatedTotal += inflated.byteLength;
        if (inflatedTotal > MAX_INFLATED_OBJECT_STREAM_BYTES) return true;
        if (segmentContainsActiveName(inflated, 0, inflated.byteLength, decoder)) return true;
      } else {
        // An object stream we cannot decode cannot be shown to be safe.
        return true;
      }
    }
    cursor = dataEnd + ENDSTREAM.length;
  }
  return false;
}

const STREAM = new TextEncoder().encode("stream");
const ENDSTREAM = new TextEncoder().encode("endstream");

function segmentContainsActiveName(
  bytes: Uint8Array,
  from: number,
  to: number,
  decoder: TextDecoder,
): boolean {
  for (let start = from; start < to; start += PDF_SCAN_CHUNK) {
    const chunkFrom = Math.max(from, start - PDF_SCAN_OVERLAP);
    const chunkTo = Math.min(to, start + PDF_SCAN_CHUNK);
    const text = normalisePdfNames(decoder.decode(bytes.subarray(chunkFrom, chunkTo)));
    if (ACTIVE_PDF_NAME.test(text)) return true;
  }
  return false;
}

/** Find a `stream` keyword that begins stream data (not `endstream`). */
function findStreamKeyword(bytes: Uint8Array, from: number): number {
  for (let index = indexOfBytes(bytes, STREAM, from); index >= 0; index = indexOfBytes(bytes, STREAM, index + 1)) {
    const after = bytes[index + STREAM.length];
    const before = index >= 3 ? bytes[index - 3] : 0;
    const isEndstream = index >= 3 && before === 0x65 && bytes[index - 2] === 0x6e && bytes[index - 1] === 0x64;
    if (!isEndstream && (after === 0x0d || after === 0x0a)) return index;
  }
  return -1;
}

function inflatePdfStream(data: Uint8Array): Uint8Array | null {
  try {
    return unzlibSync(data);
  } catch {
    try {
      return inflateSync(data);
    } catch {
      return null;
    }
  }
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from: number): number {
  const first = needle[0];
  for (
    let index = haystack.indexOf(first, from);
    index >= 0 && index <= haystack.length - needle.length;
    index = haystack.indexOf(first, index + 1)
  ) {
    let matched = true;
    for (let offset = 1; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return index;
  }
  return -1;
}
