import { ensureDatabase } from "@/db/bootstrap";
import { database, safeJson } from "@/lib/platform";

export type PublishedContent = {
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export type PublicTeamMember = {
  id: string;
  name: string;
  role: string;
  groupName: string;
  biography: string;
  linkedInUrl?: string;
  displayOrder: number;
};

export type PublicApplicationSettings = {
  open: boolean;
  introduction: string;
  closedMessage: string;
  privacyPolicyVersion: string;
};

export async function getPublishedContent(key: string): Promise<PublishedContent | null> {
  try {
    await ensureDatabase();
    const row = await database()
      .prepare("SELECT published_value FROM content_entries WHERE key = ? AND published_at IS NOT NULL")
      .bind(key)
      .first<{ published_value: string }>();
    return row ? safeJson<PublishedContent>(row.published_value, {}) : null;
  } catch {
    return null;
  }
}

export async function getPublicTeamMembers(): Promise<PublicTeamMember[]> {
  try {
    await ensureDatabase();
    const rows = await database()
      .prepare(
        `SELECT id, name, role, group_name, biography, linkedin_url, display_order
         FROM team_members WHERE active = 1
         ORDER BY group_name ASC, display_order ASC, name ASC`,
      )
      .all<{
        id: string;
        name: string;
        role: string;
        group_name: string;
        biography: string;
        linkedin_url: string | null;
        display_order: number;
      }>();
    return rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      groupName: row.group_name,
      biography: row.biography,
      linkedInUrl: row.linkedin_url ?? undefined,
      displayOrder: row.display_order,
    }));
  } catch {
    return [];
  }
}

export async function hasManagedTeamRecords(): Promise<boolean> {
  try {
    await ensureDatabase();
    const row = await database()
      .prepare("SELECT COUNT(*) AS count FROM team_members")
      .first<{ count: number }>();
    return (row?.count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function getPublicApplicationSettings(): Promise<PublicApplicationSettings> {
  const fallback = {
    open: false,
    introduction: "Join an ambitious inter-university network, develop practical commercial judgement and help publish research that other students can use.",
    closedMessage: "Applications are currently closed. Please follow our channels for the next recruitment window.",
    privacyPolicyVersion: "2026-08-04",
  };
  try {
    await ensureDatabase();
    const row = await database()
      .prepare(
        `SELECT open, introduction, closed_message, privacy_policy_version
         FROM application_settings WHERE id = 1`,
      )
      .first<{
        open: number;
        introduction: string;
        closed_message: string;
        privacy_policy_version: string;
      }>();
    return row
      ? {
          open: Boolean(row.open),
          introduction: row.introduction,
          closedMessage: row.closed_message,
          privacyPolicyVersion: row.privacy_policy_version,
        }
      : fallback;
  } catch {
    return fallback;
  }
}
