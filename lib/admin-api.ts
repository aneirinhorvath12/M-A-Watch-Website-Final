import { getAdminActor, type AdminActor } from "@/lib/admin-auth";
import { hasSafeRequestOrigin } from "@/lib/security";

export type ApiAuthorization =
  | { ok: true; actor: AdminActor }
  | { ok: false; response: Response };

export async function authorizeAdminRequest(
  request: Request,
  options: { superUser?: boolean; mutation?: boolean } = {},
): Promise<ApiAuthorization> {
  if (options.mutation && !hasSafeRequestOrigin(request)) {
    return {
      ok: false,
      response: apiError("Invalid request origin.", 403),
    };
  }

  const actor = await getAdminActor();
  if (!actor) {
    return {
      ok: false,
      response: apiError("Sign in with an active administrative account.", 401),
    };
  }
  if (options.superUser && actor.role !== "super_user") {
    return {
      ok: false,
      response: apiError("This action is restricted to Super Users.", 403),
    };
  }
  return { ok: true, actor };
}

export function apiError(
  error: string,
  status = 400,
  extra: Record<string, unknown> = {},
): Response {
  return Response.json({ ok: false, error, ...extra }, { status });
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function stringValue(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[<>]/g, "").trim().slice(0, maxLength);
}

export function normaliseSlug(value: unknown): string {
  return stringValue(value, 160)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function splitList(value: unknown, maxItems = 20): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [];
  return source
    .map((item) => stringValue(item, 254))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function validDateMilliseconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
