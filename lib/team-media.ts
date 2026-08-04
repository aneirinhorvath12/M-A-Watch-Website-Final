const PUBLIC_IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|webp)$/i;
export const MAX_TEAM_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_TEAM_MEMBER_MULTIPART_BYTES = MAX_TEAM_PHOTO_BYTES + 64 * 1024;
const MAX_TEAM_PHOTO_DIMENSION = 8_192;
const MAX_TEAM_PHOTO_PIXELS = 24_000_000;

const UPLOAD_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type InspectedTeamPhoto = {
  bytes: Uint8Array;
  contentType: keyof typeof UPLOAD_TYPES;
  extension: (typeof UPLOAD_TYPES)[keyof typeof UPLOAD_TYPES];
  width: number;
  height: number;
};

export type TeamMemberRequest = {
  payload: Record<string, unknown>;
  photo: File | null;
};

export type TeamMemberRequestResult =
  | { ok: true; value: TeamMemberRequest }
  | { ok: false; error: string; status: 400 | 413 };

export function isValidLinkedInUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com"))
    );
  } catch {
    return false;
  }
}

export async function readTeamMemberRequest(
  request: Request,
): Promise<TeamMemberRequestResult> {
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const bounded = await boundedMultipartRequest(request);
      if (!bounded.ok) return bounded;
      const form = await bounded.request.formData();
      const payload: Record<string, unknown> = {};
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") payload[key] = value;
      }
      const candidate = form.get("photo");
      return {
        ok: true,
        value: {
          payload,
          photo:
            candidate instanceof File && candidate.size > 0 ? candidate : null,
        },
      };
    }
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: "The team member request is invalid.", status: 400 };
    }
    return {
      ok: true,
      value: { payload: value as Record<string, unknown>, photo: null },
    };
  } catch {
    return { ok: false, error: "The team member request could not be read.", status: 400 };
  }
}

async function boundedMultipartRequest(
  request: Request,
): Promise<
  | { ok: true; request: Request }
  | { ok: false; error: string; status: 413 }
> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    const parsedLength = Number(declaredLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength > MAX_TEAM_MEMBER_MULTIPART_BYTES
    ) {
      return multipartTooLarge();
    }
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return {
      ok: true,
      request: new Request(request.url, {
        method: request.method,
        headers: request.headers,
      }),
    };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_TEAM_MEMBER_MULTIPART_BYTES) {
      await reader.cancel("Multipart request exceeds the upload limit.");
      return multipartTooLarge();
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
  return {
    ok: true,
    request: new Request(request.url, {
      method: request.method,
      headers,
      body: bytes.buffer,
    }),
  };
}

function multipartTooLarge(): {
  ok: false;
  error: string;
  status: 413;
} {
  return {
    ok: false,
    error: "The team member upload is too large. Photographs may be up to 5 MB.",
    status: 413,
  };
}

/**
 * Team photographs are either managed private-R2 uploads exposed through the
 * member-scoped route below or existing same-origin assets. Keeping this field
 * same-origin avoids turning the public Team page into an arbitrary third-party
 * request surface and guarantees compatibility with next/image.
 */
export function normaliseTeamPhotoPath(value: string): string | undefined {
  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return undefined;
  }

  try {
    const decodedCandidate = decodeURIComponent(candidate);
    if (decodedCandidate.split("/").some((segment) => segment === "." || segment === "..")) {
      return undefined;
    }
    const url = new URL(candidate, "https://mawatch.invalid");
    const decodedPath = decodeURIComponent(url.pathname);
    if (
      url.origin !== "https://mawatch.invalid" ||
      url.search ||
      url.hash ||
      !PUBLIC_IMAGE_EXTENSION.test(decodedPath)
    ) {
      return undefined;
    }
    return url.pathname;
  } catch {
    return undefined;
  }
}

export function managedTeamPhotoPath(
  memberId: string,
  assetId: string,
): string | null {
  if (
    !/^team_[0-9a-f-]{36}$/i.test(memberId) ||
    !/^[0-9a-f-]{36}\.(?:jpe?g|png|webp)$/i.test(assetId)
  ) {
    return null;
  }
  return `/api/team/images/${memberId}/${assetId}`;
}

export function managedTeamPhotoKey(path: string): string | null {
  const match = path.match(
    /^\/api\/team\/images\/(team_[0-9a-f-]{36})\/([0-9a-f-]{36}\.(?:jpe?g|png|webp))$/i,
  );
  return match ? `private/team-assets/${match[1]}/${match[2]}` : null;
}

export async function inspectTeamPhoto(file: File): Promise<InspectedTeamPhoto> {
  const contentType = file.type as keyof typeof UPLOAD_TYPES;
  const extension = UPLOAD_TYPES[contentType];
  if (!extension) {
    throw new Error("Choose a JPEG, PNG or WebP photograph.");
  }
  if (file.size < 1 || file.size > MAX_TEAM_PHOTO_BYTES) {
    throw new Error("Team photographs must be no larger than 5 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const dimensions =
    contentType === "image/png"
      ? await pngDimensions(bytes)
      : contentType === "image/jpeg"
        ? jpegDimensions(bytes)
        : webpDimensions(bytes);
  if (!dimensions || !safeDimensions(dimensions.width, dimensions.height)) {
    throw new Error("The photograph is invalid or its dimensions are too large.");
  }
  return { bytes, contentType, extension, ...dimensions };
}

function safeDimensions(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_TEAM_PHOTO_DIMENSION &&
    height <= MAX_TEAM_PHOTO_DIMENSION &&
    width * height <= MAX_TEAM_PHOTO_PIXELS
  );
}

const MAX_PNG_DECODED_BYTES = 96 * 1024 * 1024;
const ASCII = new TextDecoder("ascii");
const CRC32_TABLE = createCrc32Table();

async function pngDimensions(bytes: Uint8Array): Promise<{ width: number; height: number } | null> {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.byteLength < 33 ||
    !signature.every((value, index) => bytes[index] === value)
  ) {
    return null;
  }
  const view = dataView(bytes);
  let offset = 8;
  let chunkIndex = 0;
  let dimensions: { width: number; height: number } | null = null;
  let bitDepth = 0;
  let colourType = 0;
  let interlace = 0;
  let sawPalette = false;
  let sawImageData = false;
  let imageDataEnded = false;
  let totalImageData = 0;
  const imageDataChunks: Uint8Array[] = [];

  while (offset + 12 <= bytes.byteLength) {
    const length = view.getUint32(offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    if (length > bytes.byteLength - dataOffset - 4) return null;
    const dataEnd = dataOffset + length;
    const chunkEnd = dataEnd + 4;
    const typeBytes = bytes.subarray(typeOffset, dataOffset);
    const type = ASCII.decode(typeBytes);
    if (!/^[A-Za-z]{4}$/.test(type) || /[a-z]/.test(type[2])) return null;
    if (crc32(bytes.subarray(typeOffset, dataEnd)) !== view.getUint32(dataEnd)) {
      return null;
    }

    if (chunkIndex === 0 && type !== "IHDR") return null;
    if (type === "IHDR") {
      if (chunkIndex !== 0 || length !== 13 || dimensions) return null;
      dimensions = {
        width: view.getUint32(dataOffset),
        height: view.getUint32(dataOffset + 4),
      };
      bitDepth = bytes[dataOffset + 8];
      colourType = bytes[dataOffset + 9];
      interlace = bytes[dataOffset + 12];
      if (!validPngHeader(bytes.subarray(dataOffset, dataEnd))) return null;
    } else if (type === "PLTE") {
      if (!dimensions || sawPalette || sawImageData || length < 3 || length > 768 || length % 3 !== 0) {
        return null;
      }
      if (colourType === 0 || colourType === 4) return null;
      sawPalette = true;
    } else if (type === "IDAT") {
      if (!dimensions || imageDataEnded || length === 0) return null;
      sawImageData = true;
      totalImageData += length;
      if (totalImageData > MAX_TEAM_PHOTO_BYTES) return null;
      imageDataChunks.push(bytes.subarray(dataOffset, dataEnd));
    } else if (type === "IEND") {
      if (!dimensions || !sawImageData || length !== 0 || chunkEnd !== bytes.byteLength) {
        return null;
      }
      if (colourType === 3 && !sawPalette) return null;
      if (!safeDimensions(dimensions.width, dimensions.height)) return null;
      const rows = pngRowByteLengths(
        dimensions.width,
        dimensions.height,
        bitDepth,
        colourType,
        interlace,
      );
      if (!rows || !(await validPngImageData(imageDataChunks, rows))) return null;
      return dimensions;
    } else {
      if (sawImageData) imageDataEnded = true;
      // Unknown critical chunks (upper-case first byte) cannot be interpreted
      // safely; ancillary metadata is bounded by the overall 5 MB file limit.
      if ((typeBytes[0] & 0x20) === 0) return null;
    }

    offset = chunkEnd;
    chunkIndex += 1;
  }
  return null;
}

function validPngHeader(bytes: Uint8Array): boolean {
  const allowedDepths: Record<number, readonly number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  return Boolean(
    bytes.byteLength === 13 &&
      allowedDepths[bytes[9]]?.includes(bytes[8]) &&
      bytes[10] === 0 &&
      bytes[11] === 0 &&
      (bytes[12] === 0 || bytes[12] === 1),
  );
}

function pngRowByteLengths(
  width: number,
  height: number,
  bitDepth: number,
  colourType: number,
  interlace: number,
): number[] | null {
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channelCount = channels[colourType];
  if (!channelCount) return null;
  const bitsPerPixel = bitDepth * channelCount;
  const rows: number[] = [];
  const addPass = (passWidth: number, passHeight: number) => {
    if (passWidth < 1 || passHeight < 1) return;
    const rowBytes = Math.ceil((passWidth * bitsPerPixel) / 8);
    for (let row = 0; row < passHeight; row += 1) rows.push(rowBytes);
  };
  if (interlace === 0) {
    addPass(width, height);
  } else if (interlace === 1) {
    const passes = [
      [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
      [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
    ] as const;
    for (const [startX, startY, stepX, stepY] of passes) {
      const passWidth = width <= startX ? 0 : Math.ceil((width - startX) / stepX);
      const passHeight = height <= startY ? 0 : Math.ceil((height - startY) / stepY);
      addPass(passWidth, passHeight);
    }
  } else {
    return null;
  }
  const decodedBytes = rows.reduce((total, rowBytes) => total + rowBytes + 1, 0);
  return decodedBytes > 0 && decodedBytes <= MAX_PNG_DECODED_BYTES ? rows : null;
}

async function validPngImageData(
  chunks: Uint8Array[],
  rowByteLengths: number[],
): Promise<boolean> {
  const compressedLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const compressed = new Uint8Array(compressedLength);
  let compressedOffset = 0;
  for (const chunk of chunks) {
    compressed.set(chunk, compressedOffset);
    compressedOffset += chunk.byteLength;
  }
  const expectedLength = rowByteLengths.reduce((total, rowBytes) => total + rowBytes + 1, 0);
  try {
    const input = new Response(compressed.buffer).body;
    if (!input) return false;
    const reader = input.pipeThrough(new DecompressionStream("deflate")).getReader();
    let total = 0;
    let rowIndex = 0;
    let rowRemaining = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      let offset = 0;
      while (offset < value.byteLength) {
        if (rowRemaining === 0) {
          if (rowIndex >= rowByteLengths.length || value[offset] > 4) {
            await reader.cancel("Invalid PNG scanline.");
            return false;
          }
          rowRemaining = rowByteLengths[rowIndex];
          rowIndex += 1;
          offset += 1;
          total += 1;
        }
        const consumed = Math.min(rowRemaining, value.byteLength - offset);
        rowRemaining -= consumed;
        offset += consumed;
        total += consumed;
        if (total > expectedLength) {
          await reader.cancel("PNG expands beyond its declared dimensions.");
          return false;
        }
      }
    }
    return total === expectedLength && rowIndex === rowByteLengths.length && rowRemaining === 0;
  } catch {
    return false;
  }
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = dataView(bytes);
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  let dimensions: { width: number; height: number } | null = null;
  let sawQuantisationTable = false;
  let sawCodingTable = false;
  let sawScan = false;
  let sawEntropyData = false;
  while (offset < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) break;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9) {
      return offset === bytes.byteLength && Boolean(
        dimensions && sawQuantisationTable && sawCodingTable && sawScan && sawEntropyData,
      ) ? dimensions : null;
    }
    if (marker === 0xd8 || marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) return null;
    if (offset + 2 > bytes.byteLength) return null;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.byteLength) return null;
    const dataOffset = offset + 2;
    const dataEnd = offset + length;
    if (startOfFrame.has(marker)) {
      if (dimensions || !validJpegStartOfFrame(bytes, dataOffset, dataEnd)) return null;
      dimensions = {
        height: view.getUint16(dataOffset + 1),
        width: view.getUint16(dataOffset + 3),
      };
    } else if (marker === 0xdb) {
      if (!validJpegQuantisationTables(bytes, dataOffset, dataEnd)) return null;
      sawQuantisationTable = true;
    } else if (marker === 0xc4) {
      if (!validJpegHuffmanTables(bytes, dataOffset, dataEnd)) return null;
      sawCodingTable = true;
    } else if (marker === 0xcc) {
      if (length < 4 || (length - 2) % 2 !== 0) return null;
      sawCodingTable = true;
    } else if (marker === 0xda) {
      if (!dimensions || !validJpegScanHeader(bytes, dataOffset, dataEnd)) return null;
      sawScan = true;
      offset = dataEnd;
      while (offset < bytes.byteLength) {
        if (bytes[offset] !== 0xff) {
          sawEntropyData = true;
          offset += 1;
          continue;
        }
        let markerOffset = offset + 1;
        while (markerOffset < bytes.byteLength && bytes[markerOffset] === 0xff) markerOffset += 1;
        if (markerOffset >= bytes.byteLength) return null;
        const entropyMarker = bytes[markerOffset];
        if (entropyMarker === 0x00) {
          sawEntropyData = true;
          offset = markerOffset + 1;
          continue;
        }
        if (entropyMarker >= 0xd0 && entropyMarker <= 0xd7) {
          offset = markerOffset + 1;
          continue;
        }
        break;
      }
      continue;
    } else if (
      marker === 0xc8 ||
      marker === 0xdc ||
      marker === 0xde ||
      marker === 0xdf ||
      (marker >= 0xf0 && marker <= 0xfd)
    ) {
      return null;
    }
    offset = dataEnd;
  }
  return null;
}

function validJpegStartOfFrame(bytes: Uint8Array, start: number, end: number): boolean {
  if (end - start < 6) return false;
  const view = dataView(bytes);
  const precision = bytes[start];
  const height = view.getUint16(start + 1);
  const width = view.getUint16(start + 3);
  const components = bytes[start + 5];
  if ((precision !== 8 && precision !== 12) || !safeDimensions(width, height)) return false;
  if (components < 1 || components > 4 || end - start !== 6 + components * 3) return false;
  const ids = new Set<number>();
  for (let offset = start + 6; offset < end; offset += 3) {
    const id = bytes[offset];
    const sampling = bytes[offset + 1];
    if (ids.has(id) || (sampling >>> 4) < 1 || (sampling >>> 4) > 4 || (sampling & 0x0f) < 1 || (sampling & 0x0f) > 4 || bytes[offset + 2] > 3) {
      return false;
    }
    ids.add(id);
  }
  return true;
}

function validJpegQuantisationTables(bytes: Uint8Array, start: number, end: number): boolean {
  let offset = start;
  let tables = 0;
  while (offset < end) {
    const descriptor = bytes[offset];
    const precision = descriptor >>> 4;
    if (precision > 1 || (descriptor & 0x0f) > 3) return false;
    offset += 1 + (precision === 0 ? 64 : 128);
    if (offset > end) return false;
    tables += 1;
  }
  return offset === end && tables > 0;
}

function validJpegHuffmanTables(bytes: Uint8Array, start: number, end: number): boolean {
  let offset = start;
  let tables = 0;
  while (offset < end) {
    if (offset + 17 > end) return false;
    const descriptor = bytes[offset];
    if ((descriptor >>> 4) > 1 || (descriptor & 0x0f) > 3) return false;
    let symbols = 0;
    for (let index = 1; index <= 16; index += 1) symbols += bytes[offset + index];
    if (symbols < 1 || symbols > 256 || offset + 17 + symbols > end) return false;
    offset += 17 + symbols;
    tables += 1;
  }
  return offset === end && tables > 0;
}

function validJpegScanHeader(bytes: Uint8Array, start: number, end: number): boolean {
  if (end - start < 4) return false;
  const components = bytes[start];
  if (components < 1 || components > 4 || end - start !== 1 + components * 2 + 3) return false;
  const ids = new Set<number>();
  for (let offset = start + 1; offset < start + 1 + components * 2; offset += 2) {
    if (ids.has(bytes[offset]) || (bytes[offset + 1] >>> 4) > 3 || (bytes[offset + 1] & 0x0f) > 3) return false;
    ids.add(bytes[offset]);
  }
  return true;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.byteLength < 32 ||
    ASCII.decode(bytes.subarray(0, 4)) !== "RIFF" ||
    ASCII.decode(bytes.subarray(8, 12)) !== "WEBP"
  ) {
    return null;
  }
  const view = dataView(bytes);
  if (view.getUint32(4, true) !== bytes.byteLength - 8) return null;
  let offset = 12;
  let canvas: { width: number; height: number } | null = null;
  let image: { width: number; height: number } | null = null;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) return null;
    const type = ASCII.decode(bytes.subarray(offset, offset + 4));
    const length = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + length;
    const paddedEnd = dataEnd + (length % 2);
    if (dataEnd < dataOffset || paddedEnd > bytes.byteLength) return null;
    if (length % 2 === 1 && bytes[dataEnd] !== 0) return null;
    if (type === "VP8X") {
      if (canvas || offset !== 12 || length !== 10) return null;
      const flags = bytes[dataOffset];
      if ((flags & 0xc3) !== 0 || (flags & 0x02) !== 0 || bytes[dataOffset + 1] || bytes[dataOffset + 2] || bytes[dataOffset + 3]) return null;
      canvas = {
        width: littleEndian24(bytes, dataOffset + 4) + 1,
        height: littleEndian24(bytes, dataOffset + 7) + 1,
      };
      if (!safeDimensions(canvas.width, canvas.height)) return null;
    } else if (type === "VP8 ") {
      if (image) return null;
      image = lossyWebpDimensions(bytes.subarray(dataOffset, dataEnd));
      if (!image) return null;
    } else if (type === "VP8L") {
      if (image) return null;
      image = losslessWebpDimensions(bytes.subarray(dataOffset, dataEnd));
      if (!image) return null;
    } else if (type === "ANIM" || type === "ANMF") {
      // Team profile photos intentionally reject animated WebP payloads.
      return null;
    }
    offset = paddedEnd;
  }
  if (offset !== bytes.byteLength || !image || !safeDimensions(image.width, image.height)) return null;
  if (canvas && (canvas.width !== image.width || canvas.height !== image.height)) return null;
  return image;
}

function lossyWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 11 || bytes[3] !== 0x9d || bytes[4] !== 0x01 || bytes[5] !== 0x2a) return null;
  const frameTag = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16);
  const firstPartitionLength = frameTag >>> 5;
  if ((frameTag & 1) !== 0 || ((frameTag >>> 4) & 1) !== 1 || firstPartitionLength < 1 || firstPartitionLength > bytes.byteLength - 10) {
    return null;
  }
  return {
    width: (bytes[6] | (bytes[7] << 8)) & 0x3fff,
    height: (bytes[8] | (bytes[9] << 8)) & 0x3fff,
  };
}

function losslessWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 6 || bytes[0] !== 0x2f) return null;
  const bits = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24);
  if ((bits >>> 29) !== 0) return null;
  return {
    width: (bits & 0x3fff) + 1,
    height: ((bits >>> 14) & 0x3fff) + 1,
  };
}

function littleEndian24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
