/**
 * Cloudflare D1 caps LIKE/GLOB patterns at 50 UTF-8 bytes. This helper keeps
 * two bytes of headroom while preserving escaped wildcard semantics.
 */
export function d1LikePattern(value: unknown): string {
  const source = typeof value === "string"
    ? value.replace(/[<>]/g, "").trim().slice(0, 160)
    : "";
  const encode = (candidate: string) => `%${candidate.replace(/[\\%_]/g, "\\$&")}%`;
  const bytes = (candidate: string) => new TextEncoder().encode(candidate).byteLength;
  if (bytes(encode(source)) <= 48) return encode(source);

  const codePoints = Array.from(source);
  let low = 0;
  let high = codePoints.length;
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    if (bytes(encode(codePoints.slice(0, midpoint).join(""))) <= 48) low = midpoint;
    else high = midpoint - 1;
  }
  return encode(codePoints.slice(0, low).join(""));
}
