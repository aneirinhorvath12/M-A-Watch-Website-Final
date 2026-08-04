export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function truncateUtf8(value: string, maxBytes: number): string {
  const boundedBytes = Math.max(0, Math.floor(maxBytes));
  if (utf8ByteLength(value) <= boundedBytes) return value;

  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = safeCodeUnitBoundary(value, middle);
    if (utf8ByteLength(value.slice(0, candidate)) <= boundedBytes) low = middle;
    else high = middle - 1;
  }
  return value.slice(0, safeCodeUnitBoundary(value, low));
}

function safeCodeUnitBoundary(value: string, index: number): number {
  if (index <= 0 || index >= value.length) return index;
  const previous = value.charCodeAt(index - 1);
  const next = value.charCodeAt(index);
  return previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff
    ? index - 1
    : index;
}

export function boundedSearchText(
  parts: readonly string[],
  maxBytes = 24_000,
): string {
  const normalised = parts
    .join(" ")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
  return truncateUtf8(normalised, maxBytes);
}
