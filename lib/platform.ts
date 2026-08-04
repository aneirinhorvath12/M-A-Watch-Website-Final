import { env } from "cloudflare:workers";

export function database(): D1Database {
  if (!env.DB) throw new Error("The DB binding is unavailable");
  return env.DB;
}

export function privateFiles(): R2Bucket {
  if (!env.FILES) throw new Error("The FILES binding is unavailable");
  return env.FILES;
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
