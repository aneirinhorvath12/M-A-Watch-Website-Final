/** Node-only test shim for the Workerd virtual module. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      url: "data:text/javascript,export const env = new Proxy({}, { get(_target, key) { return globalThis.__testCloudflareEnv?.[key]; } });",
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
