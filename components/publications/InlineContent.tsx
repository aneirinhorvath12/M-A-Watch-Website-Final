import type { ReactNode } from "react";
import type { InlineText } from "@/lib/publications";
import styles from "./publications.module.css";

function isExternal(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

export function InlineContent({ content }: { content: InlineText[] }) {
  return content.map((item, index) => {
    let node: ReactNode = item.text;
    if (item.marks?.includes("italic")) node = <em>{node}</em>;
    if (item.marks?.includes("bold")) node = <strong>{node}</strong>;
    if (item.href) {
      node = (
        <a
          className={styles.inlineLink}
          href={item.href}
          rel={isExternal(item.href) ? "noreferrer" : undefined}
          target={isExternal(item.href) ? "_blank" : undefined}
        >
          {node}
        </a>
      );
    }
    return <span key={`${index}-${item.text.slice(0, 24)}`}>{node}</span>;
  });
}
