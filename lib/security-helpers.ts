export const MAX_CV_BYTES = 10 * 1024 * 1024;
export const MAX_PUBLICATION_BYTES = 30 * 1024 * 1024;

export type FileInspection =
  | { ok: true; bytes: ArrayBuffer }
  | { ok: false; error: string };

export function hasSafeRequestOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
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
