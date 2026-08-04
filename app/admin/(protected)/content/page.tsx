import Link from "next/link";
import {
  ManagedContentEditor,
  type ManagedEditorEntry,
} from "@/components/admin/ManagedContentEditor";
import { adminStyles as styles, PageHeader } from "@/components/admin/AdminUI";
import { database, safeJson } from "@/lib/platform";
import {
  coerceManagedContent,
  type ManagedContentKey,
} from "@/lib/site-content";

export const dynamic = "force-dynamic";

type Entry = {
  key: string;
  draft_value: string;
  published_at: number | null;
};

type ContentWorkspaceKey = "homepage-hero" | "homepage-overview" | "homepage-editorial" | "info" | "contact";

const SECTIONS: Array<{
  key: ManagedContentKey;
  label: string;
  description: string;
  previewHref: string;
}> = [
  {
    key: "homepage.hero",
    label: "Homepage hero",
    description: "The main headline, introduction and primary research link.",
    previewHref: "/preview/content/homepage",
  },
  {
    key: "homepage.overview",
    label: "Homepage overview",
    description: "The purpose statement immediately below the hero.",
    previewHref: "/preview/content/homepage",
  },
  {
    key: "homepage.editorial",
    label: "Homepage research, impact and application sections",
    description: "Manage the research cards, impact statistics and both application call-to-action states.",
    previewHref: "/preview/content/homepage",
  },
  {
    key: "info.page",
    label: "Info page",
    description: "Build the page from controlled headings, paragraphs, images, links and calls to action. HTML cannot be added.",
    previewHref: "/preview/content/info",
  },
  {
    key: "site.contact",
    label: "Contact and footer",
    description: "Manage the footer description, contact email and up to six HTTPS social links.",
    previewHref: "/preview/content/footer",
  },
];

const CONTENT_WORKSPACES: Array<{
  key: ContentWorkspaceKey;
  group: "Homepage" | "Other website content";
  label: string;
  description: string;
  entryKey: ManagedContentKey;
}> = [
  {
    key: "homepage-hero",
    group: "Homepage",
    label: "Hero",
    description: "Edit the main headline, introduction and primary research link at the top of the homepage.",
    entryKey: "homepage.hero",
  },
  {
    key: "homepage-overview",
    group: "Homepage",
    label: "Overview",
    description: "Edit the purpose statement immediately below the homepage hero.",
    entryKey: "homepage.overview",
  },
  {
    key: "homepage-editorial",
    group: "Homepage",
    label: "Research, impact and applications",
    description: "Manage featured research, impact statistics and both application call-to-action states.",
    entryKey: "homepage.editorial",
  },
  {
    key: "info",
    group: "Other website content",
    label: "Info page",
    description: "Manage the structured information page, including its text, images, links and calls to action.",
    entryKey: "info.page",
  },
  {
    key: "contact",
    group: "Other website content",
    label: "Contact and footer",
    description: "Update the organisation description, contact email and social links shown across the website.",
    entryKey: "site.contact",
  },
];

function contentWorkspace(value: string | undefined) {
  return CONTENT_WORKSPACES.find((workspace) => workspace.key === value);
}

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const params = await searchParams;
  const selectedWorkspace = contentWorkspace(params.section);
  const rows = await database()
    .prepare("SELECT key, draft_value, published_at FROM content_entries")
    .all<Entry>();
  const map = new Map(rows.results.map((row) => [row.key, row]));
  const entries = SECTIONS.map((section) => {
    const row = map.get(section.key);
    return {
      ...section,
      draft: coerceManagedContent(
        section.key,
        safeJson<unknown>(row?.draft_value, null),
      ),
      publishedAt: row?.published_at ?? null,
    };
  }) as ManagedEditorEntry[];

  if (!selectedWorkspace) {
    return (
      <>
        <PageHeader
          eyebrow="Website"
          title="Page content"
          description="Choose an area to edit. Each workspace contains only the fields for that part of the public website, with its own draft, preview and publish controls."
        />
        <div className={styles.contentNavigation}>
          {["Homepage", "Other website content"].map((group) => (
            <section className={styles.contentNavigationGroup} key={group}>
              <h2>{group}</h2>
              <nav className={styles.contentNavigationGrid} aria-label={`${group} areas`}>
                {CONTENT_WORKSPACES.filter((workspace) => workspace.group === group).map((workspace) => {
                  const entry = entries.find((candidate) => candidate.key === workspace.entryKey);
                  return (
                    <Link className={styles.contentNavCard} href={`/admin/content?section=${workspace.key}`} key={workspace.key}>
                      <span className={styles.contentNavCardTitle}>{workspace.label}</span>
                      <span className={styles.contentNavCardDescription}>{workspace.description}</span>
                      <span className={styles.contentNavCardMeta}>
                        {entry?.publishedAt ? "Published version exists; saved draft may differ" : "No published version yet"} · Open editor
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </section>
          ))}
        </div>
      </>
    );
  }

  const selectedEntries = entries.filter((entry) => entry.key === selectedWorkspace.entryKey);

  return (
    <>
      <PageHeader
        eyebrow="Website"
        title={selectedWorkspace.label}
        description={`${selectedWorkspace.description} Save a draft, inspect the authenticated preview, then publish that saved version explicitly.`}
        actions={<Link className={styles.buttonSecondary} href="/admin/content">All page content</Link>}
      />
      <nav className={styles.contentSectionTabs} aria-label="Switch content area">
        {CONTENT_WORKSPACES.map((workspace) => (
          <Link
            className={`${styles.contentSectionTab} ${workspace.key === selectedWorkspace.key ? styles.contentSectionTabActive : ""}`}
            href={`/admin/content?section=${workspace.key}`}
            aria-current={workspace.key === selectedWorkspace.key ? "page" : undefined}
            key={workspace.key}
          >
            <span className={styles.contentSectionTabGroup}>{workspace.group === "Homepage" ? "Homepage" : "Website"}</span>
            {workspace.label}
          </Link>
        ))}
      </nav>
      <ManagedContentEditor entries={selectedEntries} />
    </>
  );
}
