import { ensureDatabase } from "@/db/bootstrap";
import { d1LikePattern } from "@/lib/d1-query";
import { database, safeJson } from "@/lib/platform";
import { activeApplicantRetentionSql } from "@/lib/applicant-retention";

export const APPLICANT_STATUSES = [
  "new",
  "reviewing",
  "interview",
  "offered",
  "accepted",
  "rejected",
  "withdrawn",
] as const;

export const PUBLICATION_STATUSES = [
  "uploaded",
  "parsing",
  "draft",
  "review",
  "scheduled",
  "published",
  "archived",
  "parse_failed",
] as const;

export type ApplicantStatus = (typeof APPLICANT_STATUSES)[number];
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export function formatAdminDate(value: number | null | undefined, withTime = false): string {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" } : {}),
  }).format(new Date(value));
}

export function titleCaseStatus(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export type PublicationAdminRow = {
  id: string;
  type: "strategic" | "legal" | "markets";
  title: string;
  slug: string;
  summary: string;
  publication_date: number;
  status: PublicationStatus;
  scheduled_at: number | null;
  authors: string;
  chapter: string | null;
  cover_image_key: string | null;
  source_pdf_key: string | null;
  web_body: string;
  parser_version: string | null;
  parse_warnings: string;
  parse_error: string | null;
  structured_metadata: string;
  featured: number;
  created_at: number;
  updated_at: number;
  edit_version: number;
  published_at: number | null;
  updated_by_name?: string | null;
  published_by_name?: string | null;
};

export async function getPublicationAdmin(id: string): Promise<PublicationAdminRow | null> {
  await ensureDatabase();
  return database()
    .prepare(
      `SELECT p.*, editor.name AS updated_by_name, publisher.name AS published_by_name
       FROM publications p
       LEFT JOIN admin_users editor ON editor.id = p.updated_by
       LEFT JOIN admin_users publisher ON publisher.id = p.published_by
       WHERE p.id = ? LIMIT 1`,
    )
    .bind(id)
    .first<PublicationAdminRow>();
}

export type ApplicantAdminRow = {
  id: string;
  name: string;
  university: string;
  email: string;
  division: "law" | "finance" | "markets";
  status: ApplicantStatus;
  cv_filename: string;
  cv_size: number;
  privacy_acknowledged_at: number;
  privacy_policy_version: string;
  source: string | null;
  campaign: string | null;
  submitted_at: number;
  retention_expires_at: number | null;
  deletion_requested_at: number | null;
  deletion_requested_by: string | null;
  updated_at: number;
  duplicate_count: number;
};

export async function getApplicantAdmin(
  id: string,
  now = Date.now(),
): Promise<ApplicantAdminRow | null> {
  await ensureDatabase();
  return database()
    .prepare(
      `SELECT a.*,
        (SELECT COUNT(*) FROM applicants duplicate
         WHERE duplicate.email = a.email
           AND ${activeApplicantRetentionSql("duplicate")}) AS duplicate_count
       FROM applicants a
       WHERE a.id = ? AND ${activeApplicantRetentionSql("a")} LIMIT 1`,
    )
    .bind(now, id, now)
    .first<ApplicantAdminRow>();
}

export type ApplicantListFilters = {
  q?: string;
  status?: string;
  division?: string;
  from?: string;
  to?: string;
  sort?: string;
  ids?: string[];
  limit?: number;
  offset?: number;
  includeDeletionPending?: boolean;
};

export async function listApplicants(filters: ApplicantListFilters): Promise<ApplicantAdminRow[]> {
  await ensureDatabase();
  const now = Date.now();
  const conditions: string[] = filters.includeDeletionPending
    ? [activeApplicantRetentionSql("a")]
    : ["a.deletion_requested_at IS NULL", activeApplicantRetentionSql("a")];
  const bindings: unknown[] = [now];

  const q = filters.q?.trim().slice(0, 160);
  if (q) {
    conditions.push("(a.name LIKE ? ESCAPE '\\' OR a.university LIKE ? ESCAPE '\\' OR a.email LIKE ? ESCAPE '\\')");
    const like = d1LikePattern(q);
    bindings.push(like, like, like);
  }
  if (filters.status && APPLICANT_STATUSES.includes(filters.status as ApplicantStatus)) {
    conditions.push("a.status = ?");
    bindings.push(filters.status);
  }
  if (filters.division && ["law", "finance", "markets"].includes(filters.division)) {
    conditions.push("a.division = ?");
    bindings.push(filters.division);
  }
  if (filters.from) {
    const from = Date.parse(`${filters.from}T00:00:00.000Z`);
    if (Number.isFinite(from)) {
      conditions.push("a.submitted_at >= ?");
      bindings.push(from);
    }
  }
  if (filters.to) {
    const to = Date.parse(`${filters.to}T23:59:59.999Z`);
    if (Number.isFinite(to)) {
      conditions.push("a.submitted_at <= ?");
      bindings.push(to);
    }
  }
  if (filters.ids?.length) {
    const ids = filters.ids.slice(0, 100);
    conditions.push(`a.id IN (${ids.map(() => "?").join(",")})`);
    bindings.push(...ids);
  }

  const sort = {
    oldest: "a.submitted_at ASC",
    name: "a.name COLLATE NOCASE ASC",
    university: "a.university COLLATE NOCASE ASC",
    status: "a.status ASC, a.submitted_at DESC",
    newest: "a.submitted_at DESC",
  }[filters.sort ?? "newest"] ?? "a.submitted_at DESC";
  const limit = Math.min(10_001, Math.max(1, Math.floor(filters.limit ?? 100)));
  const offset = Number.isSafeInteger(filters.offset) ? Math.max(0, filters.offset!) : 0;
  const sql = `SELECT a.*,
      (SELECT COUNT(*) FROM applicants duplicate
       WHERE duplicate.email = a.email
         AND ${activeApplicantRetentionSql("duplicate")}) AS duplicate_count
    FROM applicants a
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY ${sort}, a.id ASC LIMIT ${limit} OFFSET ${offset}`;
  const statement = database().prepare(sql);
  const result = await statement.bind(now, ...bindings).all<ApplicantAdminRow>();
  return result.results;
}

export function parseJsonList(value: string): string[] {
  return safeJson<string[]>(value, []);
}
