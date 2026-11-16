import { database, privateFiles } from "@/lib/platform";

/**
 * R2 and D1 cannot share a transaction. A worker that dies between writing a
 * private object and committing the row that references it leaves an orphan
 * that no other code path will ever delete. This sweep samples a bounded page
 * of each managed prefix per maintenance run and removes objects that are old
 * enough to be past any in-flight write and that nothing references.
 *
 * The page start is randomised so that, across runs, the whole keyspace is
 * covered without persisting a cursor.
 */

const PAGE_LIMIT = 50;
// Applicant CVs are referenced in the same request that stores them.
const APPLICANT_CV_GRACE_MS = 60 * 60 * 1000;
// Editors may upload an image and save the body that references it later.
const PUBLICATION_ASSET_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type OrphanSweepSummary = { inspected: number; deleted: number };

export async function sweepOrphanedPrivateObjects(
  now = Date.now(),
): Promise<OrphanSweepSummary> {
  const summary: OrphanSweepSummary = { inspected: 0, deleted: 0 };
  await sweepPrefix(summary, now, {
    prefix: "private/applicants/application_",
    graceMs: APPLICANT_CV_GRACE_MS,
    isReferenced: async (key) =>
      Boolean(
        await database()
          .prepare("SELECT 1 AS present FROM applicants WHERE cv_key = ? LIMIT 1")
          .bind(key)
          .first<{ present: number }>(),
      ),
  });
  await sweepPrefix(summary, now, {
    prefix: "private/publication-assets/publication_",
    graceMs: PUBLICATION_ASSET_GRACE_MS,
    isReferenced: async (key) => {
      const match = key.match(
        /^private\/publication-assets\/(publication_[0-9a-f-]{36})\/([0-9a-f-]{36}\.[a-z0-9]+)$/i,
      );
      // Anything that does not look like a managed asset is left alone.
      if (!match) return true;
      const [, publicationId, assetId] = match;
      return Boolean(
        await database()
          .prepare(
            `SELECT 1 AS present FROM publications
             WHERE id = ? AND (instr(web_body, ?) > 0 OR instr(coalesce(cover_image_key, ''), ?) > 0)
             UNION ALL
             SELECT 1 AS present FROM publication_revisions
             WHERE publication_id = ? AND instr(web_body, ?) > 0
             LIMIT 1`,
          )
          .bind(publicationId, assetId, assetId, publicationId, assetId)
          .first<{ present: number }>(),
      );
    },
  });
  return summary;
}

async function sweepPrefix(
  summary: OrphanSweepSummary,
  now: number,
  options: {
    prefix: string;
    graceMs: number;
    isReferenced: (key: string) => Promise<boolean>;
  },
): Promise<void> {
  const startAfter = `${options.prefix}${randomHexPrefix()}`;
  const page = await privateFiles().list({
    prefix: options.prefix,
    startAfter,
    limit: PAGE_LIMIT,
  });
  for (const object of page.objects) {
    summary.inspected += 1;
    if (now - object.uploaded.getTime() < options.graceMs) continue;
    try {
      if (await options.isReferenced(object.key)) continue;
      await privateFiles().delete(object.key);
      summary.deleted += 1;
    } catch {
      console.error("Unable to sweep a private object; it will be retried.");
    }
  }
}

function randomHexPrefix(): string {
  const byte = crypto.getRandomValues(new Uint8Array(1))[0];
  return byte.toString(16).padStart(2, "0");
}
