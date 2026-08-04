import { inspectTeamPhoto } from "@/lib/team-media";
import type { ArticleBlock, PublicationCover } from "@/lib/publications/types";
import type { InfoPageContent } from "@/lib/site-content";

export const MAX_MANAGED_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_MANAGED_IMAGE_MULTIPART_BYTES =
  MAX_MANAGED_IMAGE_BYTES + 96 * 1024;

const SAFE_ASSET_ID = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;
const PUBLICATION_SCOPE = /^(?:publication_)?[a-z0-9][a-z0-9_-]{0,159}$/i;
const SAFE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isSafeManagedAssetId(value: string): boolean {
  return SAFE_ASSET_ID.test(value);
}

export type InspectedManagedImage = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
};

export type PublicationCoverReference = {
  schema: "publication-cover-v1";
  assetId: string;
  alt: string;
  width: number;
  height: number;
  contentType: InspectedManagedImage["contentType"];
};

export async function inspectManagedImage(file: File): Promise<InspectedManagedImage> {
  try {
    const inspected = await inspectTeamPhoto(file);
    return inspected;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "The image is invalid.";
    throw new Error(
      message
        .replace(/Team photographs?/gi, "Images")
        .replace(/photographs?/gi, "images"),
    );
  }
}

export async function readBoundedImageForm(
  request: Request,
): Promise<
  | { ok: true; form: FormData }
  | { ok: false; error: string; status: 400 | 413 }
> {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return { ok: false, error: "Submit the image as multipart form data.", status: 400 };
  }
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared)) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length > MAX_MANAGED_IMAGE_MULTIPART_BYTES) {
      return imageFormTooLarge();
    }
  }
  try {
    const reader = request.body?.getReader();
    if (!reader) return { ok: true, form: await request.formData() };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MANAGED_IMAGE_MULTIPART_BYTES) {
        await reader.cancel("Managed image upload exceeds the request limit.");
        return imageFormTooLarge();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const bounded = new Request(request.url, {
      method: request.method,
      headers,
      body: bytes.buffer,
    });
    return { ok: true, form: await bounded.formData() };
  } catch {
    return { ok: false, error: "The image upload could not be read.", status: 400 };
  }
}

function imageFormTooLarge(): { ok: false; error: string; status: 413 } {
  return {
    ok: false,
    error: "The image upload is too large. Images may be up to 5 MB.",
    status: 413,
  };
}

export function meaningfulImageAlt(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const alt = value.trim();
  return alt && alt.length <= 300 && !/[\u0000-\u001f]/.test(alt) ? alt : null;
}

export function createPublicationCoverReference(
  assetId: string,
  alt: string,
  image: InspectedManagedImage,
): PublicationCoverReference {
  if (!SAFE_ASSET_ID.test(assetId)) throw new Error("Invalid cover asset identifier.");
  return {
    schema: "publication-cover-v1",
    assetId,
    alt,
    width: image.width,
    height: image.height,
    contentType: image.contentType,
  };
}

export function parsePublicationCoverReference(
  value: string | null | undefined,
): PublicationCoverReference | null {
  if (!value || value.length > 1_000) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const item = parsed as Record<string, unknown>;
    if (
      item.schema !== "publication-cover-v1" ||
      typeof item.assetId !== "string" ||
      !SAFE_ASSET_ID.test(item.assetId) ||
      typeof item.alt !== "string" ||
      !meaningfulImageAlt(item.alt) ||
      !safeStoredDimension(item.width) ||
      !safeStoredDimension(item.height) ||
      Number(item.width) * Number(item.height) > 24_000_000 ||
      typeof item.contentType !== "string" ||
      !SAFE_TYPES.has(item.contentType)
    ) return null;
    return item as PublicationCoverReference;
  } catch {
    return null;
  }
}

function safeStoredDimension(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= 8_192;
}

export function publicationCoverPath(scope: string, assetId: string): string | null {
  if (!PUBLICATION_SCOPE.test(scope) || !SAFE_ASSET_ID.test(assetId)) return null;
  return `/api/publications/${encodeURIComponent(scope)}/cover/${assetId}`;
}

export function publicationCoverKey(publicationId: string, assetId: string): string | null {
  if (!PUBLICATION_SCOPE.test(publicationId) || !SAFE_ASSET_ID.test(assetId)) return null;
  return `private/publication-covers/${publicationId}/${assetId}`;
}

export function publicationCoverFromStored(
  value: string | null | undefined,
  scope: string,
): PublicationCover | undefined {
  const reference = parsePublicationCoverReference(value);
  const src = reference && publicationCoverPath(scope, reference.assetId);
  return reference && src
    ? { src, alt: reference.alt, width: reference.width, height: reference.height }
    : undefined;
}

export function managedPublicationImagePath(scope: string, assetId: string): string | null {
  if (!PUBLICATION_SCOPE.test(scope) || !SAFE_ASSET_ID.test(assetId)) return null;
  return `/api/publications/${encodeURIComponent(scope)}/images/${assetId}`;
}

export function parseManagedPublicationImagePath(
  value: string,
): { scope: string; assetId: string } | null {
  const match = value.match(/^\/api\/publications\/([^/?#]+)\/images\/([^/?#]+)$/i);
  if (!match) return null;
  let scope: string;
  try { scope = decodeURIComponent(match[1]); } catch { return null; }
  return PUBLICATION_SCOPE.test(scope) && SAFE_ASSET_ID.test(match[2])
    ? { scope, assetId: match[2] }
    : null;
}

export function publicationImageKey(publicationId: string, assetId: string): string | null {
  if (!PUBLICATION_SCOPE.test(publicationId) || !SAFE_ASSET_ID.test(assetId)) return null;
  return `private/publication-assets/${publicationId}/${assetId}`;
}

export function articleReferencesManagedImage(
  body: string,
  publicationId: string,
  slug: string,
  assetId: string,
): boolean {
  try {
    const blocks: unknown = JSON.parse(body);
    return Array.isArray(blocks) && blocks.some((block) => {
      if (!block || typeof block !== "object" || (block as { type?: unknown }).type !== "image") return false;
      const src = (block as { src?: unknown }).src;
      if (typeof src !== "string") return false;
      const managed = parseManagedPublicationImagePath(src);
      return Boolean(managed && managed.assetId === assetId && (managed.scope === publicationId || managed.scope === slug));
    });
  } catch {
    return false;
  }
}

export function managedArticleImageKeys(publicationId: string, blocks: ArticleBlock[]): string[] {
  return blocks.flatMap((block) => {
    if (block.type !== "image") return [];
    const managed = parseManagedPublicationImagePath(block.src);
    const key = managed && managed.scope === publicationId
      ? publicationImageKey(publicationId, managed.assetId)
      : null;
    return key ? [key] : [];
  });
}

export function infoAssetPath(assetId: string): string | null {
  return SAFE_ASSET_ID.test(assetId) ? `/api/content/info/assets/${assetId}` : null;
}

export function infoAssetKey(assetId: string): string | null {
  return SAFE_ASSET_ID.test(assetId) ? `private/site-assets/info/${assetId}` : null;
}

export function parseInfoAssetPath(value: string): string | null {
  const match = value.match(/^\/api\/content\/info\/assets\/([^/?#]+)$/i);
  return match && SAFE_ASSET_ID.test(match[1]) ? match[1] : null;
}

export function infoImageAssetIds(value: unknown): Set<string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return new Set();
  const blocks = (value as Partial<InfoPageContent>).blocks;
  if (!Array.isArray(blocks)) return new Set();
  return new Set(blocks.flatMap((block) => {
    if (!block || block.type !== "image") return [];
    const assetId = parseInfoAssetPath(block.src);
    return assetId ? [assetId] : [];
  }));
}

export function safeManagedImageContentType(value: string | undefined): value is InspectedManagedImage["contentType"] {
  return Boolean(value && SAFE_TYPES.has(value));
}
