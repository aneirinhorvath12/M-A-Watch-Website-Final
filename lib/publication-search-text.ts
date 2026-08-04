import { boundedSearchText } from "@/lib/text-limits";
import type { ArticleBlock } from "@/lib/publications/types";

function blockText(block: ArticleBlock): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "quote":
      return [
        ...block.content.map((item) => item.text),
        block.type === "quote" ? block.attribution ?? "" : "",
      ].join(" ");
    case "list":
      return block.items.flat().map((item) => item.text).join(" ");
    case "image":
      return `${block.alt} ${block.caption ?? ""}`;
    case "table":
      return [block.caption ?? "", ...block.headers, ...block.rows.flat()].join(" ");
    case "references":
      return block.entries
        .flatMap((entry) => [entry.title, entry.detail ?? ""])
        .join(" ");
    case "divider":
      return "";
  }
}

export function publicationSearchText(
  existingMetadataText: string,
  blocks: readonly ArticleBlock[],
): string {
  return boundedSearchText([existingMetadataText, ...blocks.map(blockText)]);
}
