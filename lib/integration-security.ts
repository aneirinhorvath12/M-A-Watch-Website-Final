const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function validatedIntegrationUrl(
  value: string,
  options: { allowLoopbackHttp?: boolean } = {},
): string | null {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.toString();
    if (
      options.allowLoopbackHttp &&
      url.protocol === "http:" &&
      LOOPBACK_HOSTS.has(url.hostname)
    ) {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}
