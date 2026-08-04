import { ArticleBody } from "@/components/publications/ArticleBody";
import type { ArticleBlock } from "@/lib/publications/types";
import styles from "./admin.module.css";

function articleBlocks(value: string): ArticleBlock[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as ArticleBlock[] : [];
  } catch {
    return [];
  }
}

export function PublicationBodyPreview({ value }: { value: string }) {
  const blocks = articleBlocks(value);
  if (!blocks.length) {
    return <p className={styles.emptyText}>No approved web blocks have been saved yet.</p>;
  }
  return <div className={styles.previewBox}><ArticleBody blocks={blocks} /></div>;
}
