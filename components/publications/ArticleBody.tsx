import Image from "next/image";
import type { ArticleBlock } from "@/lib/publications/types";
import { InlineContent } from "./InlineContent";
import styles from "./publications.module.css";

function renderHeading(block: Extract<ArticleBlock, { type: "heading" }>) {
  if (block.level === 2) {
    return (
      <h2 className={styles.articleHeading2} id={block.id}>
        <InlineContent content={block.content} />
      </h2>
    );
  }
  if (block.level === 3) {
    return (
      <h3 className={styles.articleHeading3} id={block.id}>
        <InlineContent content={block.content} />
      </h3>
    );
  }
  return (
    <h4 className={styles.articleHeading4} id={block.id}>
      <InlineContent content={block.content} />
    </h4>
  );
}

export function ArticleBody({
  blocks,
  privatePreview = false,
}: {
  blocks: ArticleBlock[];
  privatePreview?: boolean;
}) {
  return (
    <div className={styles.articleBody}>
      {blocks.map((block) => {
        switch (block.type) {
          case "heading":
            return <div key={block.id}>{renderHeading(block)}</div>;
          case "paragraph":
            return (
              <p className={styles.articleParagraph} key={block.id}>
                <InlineContent content={block.content} />
              </p>
            );
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag className={styles.articleList} key={block.id}>
                {block.items.map((item, index) => (
                  <li key={`${block.id}-${index}`}>
                    <InlineContent content={item} />
                  </li>
                ))}
              </Tag>
            );
          }
          case "quote":
            return (
              <figure className={styles.articleQuote} key={block.id}>
                <blockquote>
                  <InlineContent content={block.content} />
                </blockquote>
                {block.attribution ? <figcaption>{block.attribution}</figcaption> : null}
              </figure>
            );
          case "image":
            return (
              <figure className={styles.articleFigure} key={block.id}>
                {block.src.startsWith("/") && !block.src.startsWith("//") ? (
                  <Image
                    alt={block.alt}
                    height={block.height}
                    sizes="(max-width: 800px) 100vw, 760px"
                    src={block.src}
                    width={block.width}
                    unoptimized={privatePreview && block.src.startsWith("/api/publications/")}
                  />
                ) : <span role="img" aria-label={block.alt}>Image unavailable</span>}
                {block.caption ? <figcaption>{block.caption}</figcaption> : null}
              </figure>
            );
          case "table":
            return (
              <figure className={styles.articleTableFigure} key={block.id}>
                <div className={styles.tableScroll} tabIndex={0}>
                  <table>
                    {block.caption ? <caption>{block.caption}</caption> : null}
                    <thead>
                      <tr>
                        {block.headers.map((header, index) => (
                          <th key={`${block.id}-header-${index}`} scope="col">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row, rowIndex) => (
                        <tr key={`${block.id}-row-${rowIndex}`}>
                          {row.map((cell, cellIndex) => (
                            <td key={`${block.id}-cell-${rowIndex}-${cellIndex}`}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </figure>
            );
          case "references":
            return (
              <section className={styles.references} key={block.id} aria-labelledby={`${block.id}-title`}>
                <h2 id={`${block.id}-title`}>{block.title ?? "References"}</h2>
                <ol>
                  {block.entries.map((entry) => (
                    <li key={`${block.id}-${entry.label}`}>
                      <span className={styles.referenceLabel}>{entry.label}</span>
                      {entry.href ? (
                        <a href={entry.href} rel="noreferrer" target="_blank">
                          {entry.title}
                        </a>
                      ) : (
                        <span>{entry.title}</span>
                      )}
                      {entry.detail ? <small>{entry.detail}</small> : null}
                    </li>
                  ))}
                </ol>
              </section>
            );
          case "divider":
            return <hr className={styles.articleDivider} key={block.id} />;
        }
      })}
    </div>
  );
}
