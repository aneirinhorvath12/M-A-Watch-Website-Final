import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HomePageContent } from "@/components/site/home-page-content";
import { InfoPageContentView } from "@/components/site/info-page-content";
import { SiteFooter } from "@/components/site/site-footer";
import { ensureDatabase } from "@/db/bootstrap";
import { getAdminActor } from "@/lib/admin-auth";
import { database, safeJson } from "@/lib/platform";
import { getLiveFeaturedPublications } from "@/lib/publications";
import { getPublicApplicationSettings } from "@/lib/public-content";
import {
  coerceManagedContent,
  type BasicPageContent,
  type HomepageEditorialContent,
  type InfoPageContent,
  type ManagedContentKey,
  type SiteContactContent,
} from "@/lib/site-content";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Private content preview",
  robots: { index: false, follow: false, nocache: true },
};

const PREVIEW_PAGES = new Set(["homepage", "info", "footer"]);

type DraftRow = { key: string; draft_value: string };

function PreviewBanner({ page }: { page: string }) {
  return (
    <div className={styles.banner} role="status">
      <strong>Private saved-draft preview · {page}</strong>
      <span>Unsaved editor changes are not shown. This route is restricted to active administrators and excluded from search engines.</span>
      <Link href="/admin/content">Return to editing</Link>
    </div>
  );
}

export default async function ContentPreviewPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (!PREVIEW_PAGES.has(page)) notFound();
  const returnTo = `/preview/content/${page}`;
  const actor = await getAdminActor();
  if (!actor) redirect(`/admin/login?return_to=${encodeURIComponent(returnTo)}`);

  await ensureDatabase();
  const rows = await database()
    .prepare("SELECT key, draft_value FROM content_entries")
    .all<DraftRow>();
  const drafts = new Map(rows.results.map((row) => [row.key, row.draft_value]));
  const draft = (key: ManagedContentKey) => coerceManagedContent(
    key,
    safeJson<unknown>(drafts.get(key), null),
  );

  if (page === "homepage") {
    const [featured, applicationSettings] = await Promise.all([
      getLiveFeaturedPublications(3),
      getPublicApplicationSettings(),
    ]);
    return (
      <>
        <PreviewBanner page="homepage" />
        <HomePageContent
          featured={featured}
          heroContent={draft("homepage.hero") as BasicPageContent}
          overviewContent={draft("homepage.overview") as BasicPageContent}
          editorialContent={draft("homepage.editorial") as HomepageEditorialContent}
          applicationSettings={applicationSettings}
        />
      </>
    );
  }

  if (page === "info") {
    return (
      <>
        <PreviewBanner page="info" />
        <InfoPageContentView content={draft("info.page") as InfoPageContent} privatePreview />
      </>
    );
  }

  return (
    <>
      <PreviewBanner page="footer" />
      <main className={styles.footerIntro}>
        <div className="site-shell">
          <p className="eyebrow">Footer preview</p>
          <h1>The saved contact draft appears below.</h1>
        </div>
      </main>
      <SiteFooter
        initialContent={draft("site.contact") as SiteContactContent}
        loadPublished={false}
      />
    </>
  );
}
