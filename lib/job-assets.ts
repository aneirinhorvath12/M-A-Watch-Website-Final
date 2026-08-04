/**
 * Produce a stable UUID-shaped asset id for one exact background-job claim.
 * A recovered job receives a new claim token, so an expired worker can clean
 * only its own staged figures and cannot delete the replacement worker's bytes.
 */
export async function claimScopedImageId(
  jobId: string,
  claimToken: string,
  bytes: Uint8Array,
): Promise<string> {
  if (!jobId || !claimToken) {
    throw new Error("A job and claim are required for a staged image.");
  }
  const claimBytes = new TextEncoder().encode(`${jobId}:${claimToken}:`);
  const input = new Uint8Array(claimBytes.byteLength + bytes.byteLength);
  input.set(claimBytes);
  input.set(bytes, claimBytes.byteLength);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  const value = digest.slice(0, 16);
  value[6] = (value[6] & 0x0f) | 0x40;
  value[8] = (value[8] & 0x3f) | 0x80;
  const hex = Array.from(value, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
