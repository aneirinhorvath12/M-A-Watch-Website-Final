import { ensureDatabase } from "@/db/bootstrap";
import { database, safeJson } from "@/lib/platform";
import { normaliseTeamPhotoPath } from "@/lib/team-media";
import { currentRecruitmentIntakeReadiness } from "@/lib/recruitment-runtime";
import { CURRENT_APPLICATION_PRIVACY_VERSION } from "@/lib/data-policy";
import {
  coerceManagedContent,
  defaultForKey,
  type BasicPageContent,
  type HomepageEditorialContent,
  type InfoPageContent,
  type ManagedContentKey,
  type ManagedContentValue,
  type SiteContactContent,
} from "@/lib/site-content";

export type PublicTeamMember = {
  id: string;
  name: string;
  role: string;
  groupName: string;
  biography: string;
  photoKey?: string;
  photoAlt?: string;
  linkedInUrl?: string;
  displayOrder: number;
};

export type PublicApplicationSettings = {
  open: boolean;
  introduction: string;
  closedMessage: string;
  privacyPolicyVersion: string;
};

async function getPublishedManagedContent(
  key: ManagedContentKey,
): Promise<ManagedContentValue> {
  try {
    await ensureDatabase();
    const row = await database()
      .prepare("SELECT published_value FROM content_entries WHERE key = ? AND published_at IS NOT NULL")
      .bind(key)
      .first<{ published_value: string }>();
    return row
      ? coerceManagedContent(key, safeJson<unknown>(row.published_value, null))
      : defaultForKey(key);
  } catch {
    return defaultForKey(key);
  }
}

export async function getPublishedBasicContent(
  key: "homepage.hero" | "homepage.overview",
): Promise<BasicPageContent> {
  return getPublishedManagedContent(key) as Promise<BasicPageContent>;
}

export async function getPublishedHomepageEditorial(): Promise<HomepageEditorialContent> {
  return getPublishedManagedContent("homepage.editorial") as Promise<HomepageEditorialContent>;
}

export async function getPublishedInfoPage(): Promise<InfoPageContent> {
  return getPublishedManagedContent("info.page") as Promise<InfoPageContent>;
}

export async function getPublishedSiteContact(): Promise<SiteContactContent> {
  return getPublishedManagedContent("site.contact") as Promise<SiteContactContent>;
}

export async function getPublicTeamMembers(): Promise<PublicTeamMember[]> {
  try {
    await ensureDatabase();
    const rows = await database()
      .prepare(
        `SELECT id, name, role, group_name, biography, photo_key, photo_alt, linkedin_url, display_order
         FROM team_members WHERE active = 1
         ORDER BY group_name ASC, display_order ASC, name ASC`,
      )
      .all<{
        id: string;
        name: string;
        role: string;
        group_name: string;
        biography: string;
        photo_key: string | null;
        photo_alt: string | null;
        linkedin_url: string | null;
        display_order: number;
      }>();
    return rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      groupName: row.group_name,
      biography: row.biography,
      photoKey: normaliseTeamPhotoPath(row.photo_key ?? ""),
      photoAlt: row.photo_alt ?? undefined,
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
    privacyPolicyVersion: CURRENT_APPLICATION_PRIVACY_VERSION,
  };
  try {
    await ensureDatabase();
    const row = await database()
      .prepare(
        `SELECT open, introduction, closed_message, notification_recipients,
                privacy_policy_version, retention_days
         FROM application_settings WHERE id = 1`,
      )
      .first<{
        open: number;
        introduction: string;
        closed_message: string;
        notification_recipients: string;
        privacy_policy_version: string;
        retention_days: number | null;
      }>();
    const readiness = row
      ? await currentRecruitmentIntakeReadiness({
          retentionDays: row.retention_days,
          privacyPolicyVersion: row.privacy_policy_version,
          notificationRecipients: safeJson<string[]>(
            row.notification_recipients,
            [],
          ),
        })
      : null;
    return row
      ? {
          open: Boolean(row.open) && Boolean(readiness?.ready),
          introduction: row.introduction,
          closedMessage: row.closed_message,
          privacyPolicyVersion: row.privacy_policy_version,
        }
      : fallback;
  } catch {
    return fallback;
  }
}
