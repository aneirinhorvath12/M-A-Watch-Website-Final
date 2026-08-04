import type { PrototypeExtraction } from "@/lib/parser/contract";
import { unzipSync } from "fflate";
import {
  isTrustedAdobeApiUrl,
  isTrustedAdobeStorageUrl,
  type AdobeParserConfig,
} from "./config";
import {
  mapAdobeStructuredData,
  parserVersionForAdobeStructuredData,
} from "./mapper";

const TOKEN_RESPONSE_LIMIT = 16 * 1024;
const CONTROL_RESPONSE_LIMIT = 64 * 1024;
const STRUCTURED_DATA_LIMIT = 16 * 1024 * 1024;
const RESOURCE_ARCHIVE_LIMIT = 32 * 1024 * 1024;
const FIGURE_RENDITION_LIMIT = 5 * 1024 * 1024;
const FIGURE_RENDITIONS_TOTAL_LIMIT = 20 * 1024 * 1024;
const MAX_FIGURE_RENDITIONS = 250;
const MAX_RENDITION_ARCHIVE_ENTRIES = 1_000;
const MAX_FIGURE_PIXELS = 40_000_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 25_000;
const DEFAULT_POLL_SECONDS = 5;
const MIN_POLL_SECONDS = 2;
const MAX_POLL_SECONDS = 60;
const MAX_POLL_COUNT = 120;
const MAX_JOB_AGE_MS = 6 * 60 * 60 * 1000;

type Fetch = typeof fetch;

export type AdobeExtractJobState = {
  schemaVersion: "1";
  provider: "adobe-pdf-services";
  phase: "polling";
  pollingUrl: string;
  inputAssetId: string;
  submittedAt: string;
  pollCount: number;
  notBefore: string;
};

export type AdobeExtractCompletion = {
  kind: "complete";
  extraction: PrototypeExtraction;
  parserVersion: string;
  structuredData: Record<string, unknown>;
  figureRenditions: AdobeFigureRendition[];
};

export type AdobeFigureRendition = {
  path: string;
  bytes: Uint8Array;
  width: number;
  height: number;
};

export type AdobeExtractPending = {
  kind: "pending";
  state: AdobeExtractJobState;
  retryAfterMs: number;
};

export type AdobeExtractFailed = {
  kind: "failed";
  code: string;
  message: string;
};

export type AdobeExtractPollResult =
  | AdobeExtractCompletion
  | AdobeExtractPending
  | AdobeExtractFailed;

export class AdobeParserAdapterError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "AdobeParserAdapterError";
    this.code = code;
    this.retryable = retryable;
  }
}

type AdobeClientOptions = {
  fetch?: Fetch;
  now?: () => Date;
  requestTimeoutMs?: number;
};

/**
 * Submit an Adobe Extract job without waiting for extraction to finish.
 * The returned state contains no bearer token or pre-signed storage URL.
 */
export async function startAdobeExtractJob(
  config: AdobeParserConfig,
  pdfBytes: ArrayBuffer | Uint8Array,
  options: AdobeClientOptions = {},
): Promise<AdobeExtractPending> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now?.() ?? new Date();
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const accessToken = await getAccessToken(
    config,
    fetchImpl,
    requestTimeoutMs,
  );
  const requestHeaders = adobeHeaders(config, accessToken);

  const assetResponse = await fetchBounded(
    fetchImpl,
    `${config.baseUrl}/assets`,
    {
      method: "POST",
      headers: { ...requestHeaders, "content-type": "application/json" },
      body: JSON.stringify({ mediaType: "application/pdf" }),
    },
    requestTimeoutMs,
  );
  await assertExpectedStatus(assetResponse, 200, "ASSET_CREATE_FAILED");
  const asset = await readJsonObject(
    assetResponse,
    CONTROL_RESPONSE_LIMIT,
    "asset response",
    requestTimeoutMs,
  );
  const assetId = requiredString(asset.assetID, "assetID");
  const uploadUri = requiredString(asset.uploadUri, "uploadUri");
  if (!isTrustedAdobeStorageUrl(uploadUri, config)) {
    throw new AdobeParserAdapterError(
      "UNTRUSTED_STORAGE_URL",
      "Adobe returned an untrusted asset upload URL.",
    );
  }

  const uploadResponse = await fetchBounded(
    fetchImpl,
    uploadUri,
    {
      method: "PUT",
      headers: { "content-type": "application/pdf" },
      body: exactArrayBuffer(pdfBytes),
    },
    requestTimeoutMs,
  );
  if (!uploadResponse.ok) {
    throw httpError(uploadResponse.status, "ASSET_UPLOAD_FAILED");
  }

  const submitResponse = await fetchBounded(
    fetchImpl,
    `${config.baseUrl}/operation/extractpdf`,
    {
      method: "POST",
      headers: { ...requestHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        assetID: assetId,
        elementsToExtract: ["text", "tables"],
        renditionsToExtract: ["figures"],
        includeStyling: true,
      }),
    },
    requestTimeoutMs,
  );
  await assertExpectedStatus(submitResponse, 201, "JOB_SUBMIT_FAILED");
  const location = submitResponse.headers.get("location");
  if (!location) {
    throw new AdobeParserAdapterError(
      "MISSING_POLLING_URL",
      "Adobe accepted the extraction job without returning a polling URL.",
    );
  }
  const pollingUrl = new URL(location, config.baseUrl).toString();
  if (!isTrustedAdobeApiUrl(pollingUrl, config)) {
    throw new AdobeParserAdapterError(
      "UNTRUSTED_POLLING_URL",
      "Adobe returned an untrusted extraction polling URL.",
    );
  }
  const retryAfterMs = retryDelayMs(submitResponse.headers, now);
  return {
    kind: "pending",
    retryAfterMs,
    state: {
      schemaVersion: "1",
      provider: "adobe-pdf-services",
      phase: "polling",
      pollingUrl,
      inputAssetId: assetId,
      submittedAt: now.toISOString(),
      pollCount: 0,
      notBefore: new Date(now.getTime() + retryAfterMs).toISOString(),
    },
  };
}

/** Poll Adobe exactly once. This function never sleeps or loops. */
export async function pollAdobeExtractJob(
  config: AdobeParserConfig,
  state: AdobeExtractJobState,
  options: AdobeClientOptions = {},
): Promise<AdobeExtractPollResult> {
  validateState(state, config);
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now?.() ?? new Date();
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const notBefore = Date.parse(state.notBefore);
  if (now.getTime() < notBefore) {
    return {
      kind: "pending",
      state,
      retryAfterMs: notBefore - now.getTime(),
    };
  }
  if (
    state.pollCount >= MAX_POLL_COUNT ||
    now.getTime() - Date.parse(state.submittedAt) > MAX_JOB_AGE_MS
  ) {
    return {
      kind: "failed",
      code: "ADOBE_JOB_EXPIRED",
      message: "Adobe did not complete the extraction within the allowed window.",
    };
  }

  const accessToken = await getAccessToken(
    config,
    fetchImpl,
    requestTimeoutMs,
  );
  const statusResponse = await fetchBounded(
    fetchImpl,
    state.pollingUrl,
    { method: "GET", headers: adobeHeaders(config, accessToken) },
    requestTimeoutMs,
  );
  await assertExpectedStatus(statusResponse, 200, "JOB_STATUS_FAILED");
  const statusBody = await readJsonObject(
    statusResponse,
    CONTROL_RESPONSE_LIMIT,
    "job status response",
    requestTimeoutMs,
  );
  const status = requiredString(statusBody.status, "status").toLowerCase();
  if (status === "in progress") {
    const retryAfterMs = retryDelayMs(statusResponse.headers, now);
    return {
      kind: "pending",
      retryAfterMs,
      state: {
        ...state,
        pollCount: state.pollCount + 1,
        notBefore: new Date(now.getTime() + retryAfterMs).toISOString(),
      },
    };
  }
  if (status === "failed") {
    const providerCode = safeProviderCode(statusBody.error);
    return {
      kind: "failed",
      code: providerCode ? `ADOBE_${providerCode}` : "ADOBE_EXTRACT_FAILED",
      message: "Adobe could not extract a reliable document structure.",
    };
  }
  if (status !== "done") {
    throw new AdobeParserAdapterError(
      "INVALID_JOB_STATUS",
      "Adobe returned an unsupported extraction job status.",
    );
  }

  const content = recordField(statusBody.content, "content");
  const downloadUri = extractDownloadUri(content);
  if (!isTrustedAdobeStorageUrl(downloadUri, config)) {
    throw new AdobeParserAdapterError(
      "UNTRUSTED_STORAGE_URL",
      "Adobe returned an untrusted structured-data download URL.",
    );
  }
  const contentResponse = await fetchBounded(
    fetchImpl,
    downloadUri,
    { method: "GET" },
    requestTimeoutMs,
  );
  if (!contentResponse.ok) {
    throw httpError(contentResponse.status, "CONTENT_DOWNLOAD_FAILED");
  }
  const structuredData = await readJsonObject(
    contentResponse,
    STRUCTURED_DATA_LIMIT,
    "structured extraction data",
    requestTimeoutMs,
  );
  const resource = recordField(statusBody.resource, "resource");
  const resourceDownloadUri = extractDownloadUri(resource);
  if (!isTrustedAdobeStorageUrl(resourceDownloadUri, config)) {
    throw new AdobeParserAdapterError(
      "UNTRUSTED_STORAGE_URL",
      "Adobe returned an untrusted rendition archive download URL.",
    );
  }
  const resourceResponse = await fetchBounded(
    fetchImpl,
    resourceDownloadUri,
    { method: "GET" },
    requestTimeoutMs,
  );
  if (!resourceResponse.ok) {
    throw httpError(resourceResponse.status, "RESOURCE_DOWNLOAD_FAILED");
  }
  const resourceArchive = await readBoundedBytes(
    resourceResponse,
    RESOURCE_ARCHIVE_LIMIT,
    "rendition archive",
    requestTimeoutMs,
  );
  return {
    kind: "complete",
    extraction: mapAdobeStructuredData(structuredData),
    parserVersion: parserVersionForAdobeStructuredData(structuredData),
    structuredData,
    figureRenditions: extractFigureRenditions(resourceArchive),
  };
}

async function getAccessToken(
  config: AdobeParserConfig,
  fetchImpl: Fetch,
  requestTimeoutMs: number,
): Promise<string> {
  const response = await fetchBounded(
    fetchImpl,
    config.tokenUrl,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    },
    requestTimeoutMs,
  );
  await assertExpectedStatus(response, 200, "AUTHENTICATION_FAILED");
  const token = await readJsonObject(
    response,
    TOKEN_RESPONSE_LIMIT,
    "token response",
    requestTimeoutMs,
  );
  return requiredString(token.access_token, "access_token");
}

function adobeHeaders(
  config: AdobeParserConfig,
  accessToken: string,
): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    "x-api-key": config.clientId,
  };
}

async function fetchBounded(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AdobeParserAdapterError(
        "REQUEST_TIMEOUT",
        "The Adobe request timed out.",
        true,
      );
    }
    throw new AdobeParserAdapterError(
      "NETWORK_ERROR",
      "The Adobe request could not be completed.",
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function assertExpectedStatus(
  response: Response,
  expected: number,
  code: string,
): Promise<void> {
  if (response.status !== expected) throw httpError(response.status, code);
}

function httpError(status: number, code: string): AdobeParserAdapterError {
  const retryable = status === 408 || status === 429 || status >= 500;
  return new AdobeParserAdapterError(
    `${code}_${status}`,
    `Adobe returned HTTP ${status}.`,
    retryable,
  );
}

async function readJsonObject(
  response: Response,
  maxBytes: number,
  label: string,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const bytes = await readBoundedBytes(response, maxBytes, label, timeoutMs);
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new AdobeParserAdapterError(
      "INVALID_JSON_RESPONSE",
      `The Adobe ${label} is not a JSON object.`,
    );
  }
}

async function readBoundedBytes(
  response: Response,
  maxBytes: number,
  label: string,
  timeoutMs: number,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new AdobeParserAdapterError(
      "RESPONSE_TOO_LARGE",
      `The Adobe ${label} exceeds the adapter limit.`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      void reader.cancel().catch(() => undefined);
      reject(
        new AdobeParserAdapterError(
          "RESPONSE_BODY_TIMEOUT",
          `The Adobe ${label} did not finish within the response deadline.`,
          true,
        ),
      );
    }, timeoutMs);
  });

  const read = async (): Promise<Uint8Array> => {
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          void reader.cancel().catch(() => undefined);
          throw new AdobeParserAdapterError(
            "RESPONSE_TOO_LARGE",
            `The Adobe ${label} exceeds the adapter limit.`,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  };

  try {
    return await Promise.race([read(), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function extractFigureRenditions(archive: Uint8Array): AdobeFigureRendition[] {
  const accepted = new Set<string>();
  let totalOriginalBytes = 0;
  let inspectedEntries = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(archive, {
      filter(file) {
        inspectedEntries += 1;
        if (inspectedEntries > MAX_RENDITION_ARCHIVE_ENTRIES) {
          throw new Error("Oversized rendition archive directory");
        }
        const path = file.name;
        if (!/^figures\/[a-zA-Z0-9._-]+\.png$/i.test(path)) return false;
        if (
          accepted.has(path) ||
          accepted.size >= MAX_FIGURE_RENDITIONS ||
          !Number.isFinite(file.originalSize) ||
          file.originalSize < 1 ||
          file.originalSize > FIGURE_RENDITION_LIMIT ||
          totalOriginalBytes + file.originalSize >
            FIGURE_RENDITIONS_TOTAL_LIMIT
        ) {
          throw new Error("Unsafe figure rendition entry");
        }
        accepted.add(path);
        totalOriginalBytes += file.originalSize;
        return true;
      },
    });
  } catch {
    throw new AdobeParserAdapterError(
      "INVALID_RENDITION_ARCHIVE",
      "Adobe returned an invalid or unsafe rendition archive.",
    );
  }

  return Object.entries(files).map(([path, bytes]) => {
    const dimensions = pngDimensions(bytes);
    if (!dimensions) {
      throw new AdobeParserAdapterError(
        "INVALID_FIGURE_RENDITION",
        "Adobe returned a figure rendition that is not a bounded PNG image.",
      );
    }
    return { path, bytes, ...dimensions };
  });
}

function pngDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.byteLength < 33 ||
    !signature.every((value, index) => bytes[index] === value) ||
    new TextDecoder("ascii").decode(bytes.slice(12, 16)) !== "IHDR"
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13) return null;
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (
    width < 1 ||
    height < 1 ||
    width > 12_000 ||
    height > 12_000 ||
    width * height > MAX_FIGURE_PIXELS ||
    !validPngIhdr(bytes)
  ) {
    return null;
  }
  return { width, height };
}

function validPngIhdr(bytes: Uint8Array): boolean {
  const bitDepth = bytes[24];
  const colourType = bytes[25];
  const allowedDepths: Record<number, readonly number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  return Boolean(
    allowedDepths[colourType]?.includes(bitDepth) &&
      bytes[26] === 0 &&
      bytes[27] === 0 &&
      (bytes[28] === 0 || bytes[28] === 1),
  );
}

function retryDelayMs(headers: Headers, now: Date): number {
  const raw = headers.get("retry-after")?.trim();
  let seconds = DEFAULT_POLL_SECONDS;
  if (raw && /^\d+$/.test(raw)) {
    seconds = Number(raw);
  } else if (raw) {
    const date = Date.parse(raw);
    if (Number.isFinite(date)) seconds = Math.ceil((date - now.getTime()) / 1000);
  }
  const bounded = Math.max(MIN_POLL_SECONDS, Math.min(MAX_POLL_SECONDS, seconds));
  return bounded * 1000;
}

function validateState(
  state: AdobeExtractJobState,
  config: AdobeParserConfig,
): void {
  const validDates =
    Number.isFinite(Date.parse(state.submittedAt)) &&
    Number.isFinite(Date.parse(state.notBefore));
  if (
    state.schemaVersion !== "1" ||
    state.provider !== "adobe-pdf-services" ||
    state.phase !== "polling" ||
    !state.inputAssetId.trim() ||
    !Number.isInteger(state.pollCount) ||
    state.pollCount < 0 ||
    !validDates ||
    !isTrustedAdobeApiUrl(state.pollingUrl, config)
  ) {
    throw new AdobeParserAdapterError(
      "INVALID_JOB_STATE",
      "The persisted Adobe extraction state is invalid.",
    );
  }
}

function exactArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdobeParserAdapterError(
      "INVALID_RESPONSE_SHAPE",
      `Adobe omitted the required ${field} field.`,
    );
  }
  return value.trim();
}

function recordField(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdobeParserAdapterError(
      "INVALID_RESPONSE_SHAPE",
      `Adobe omitted the required ${field} object.`,
    );
  }
  return value as Record<string, unknown>;
}

function extractDownloadUri(content: Record<string, unknown>): string {
  const candidates = [content.downloadUri, content.downloadURI].filter(
    (value): value is string => typeof value === "string" && Boolean(value.trim()),
  );
  if (candidates.length !== 1) {
    throw new AdobeParserAdapterError(
      "INVALID_RESPONSE_SHAPE",
      "Adobe must return exactly one structured-data download URL.",
    );
  }
  return candidates[0].trim();
}

function safeProviderCode(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const code = (value as Record<string, unknown>).code;
  if (typeof code !== "string") return null;
  const safe = code.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 80);
  return safe || null;
}
