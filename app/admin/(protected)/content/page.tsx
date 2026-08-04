import {
  ManagedContentEditor,
  type ManagedEditorEntry,
} from "@/components/admin/ManagedContentEditor";
import { PageHeader } from "@/components/admin/AdminUI";
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

export default async function ContentPage() {
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

  return (
    <>
      <PageHeader
        eyebrow="Website"
        title="Page content"
        description="Edit controlled public content without changing the visual system. Save a draft, inspect the authenticated exact-page preview, then publish that saved version explicitly."
      />
      <ManagedContentEditor entries={entries} />
    </>
  );
}
