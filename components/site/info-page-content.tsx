import Image from "next/image";
import Link from "next/link";
import { PageIntro } from "@/components/site/page-intro";
import type { InfoContentBlock, InfoPageContent } from "@/lib/site-content";

function ManagedLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return href.startsWith("/") ? (
    <Link className={className} href={href}>{children}</Link>
  ) : (
    <a className={className} href={href}>{children}</a>
  );
}

function InfoBlock({ block, privatePreview }: { block: InfoContentBlock; privatePreview: boolean }) {
  if (block.type === "heading") {
    return block.level === 2
      ? <h2 className="info-managed__heading">{block.text}</h2>
      : <h3 className="info-managed__subheading">{block.text}</h3>;
  }
  if (block.type === "paragraph") {
    return <p className="info-managed__paragraph">{block.text}</p>;
  }
  if (block.type === "image") {
    const managed = block.src.startsWith("/api/content/info/assets/");
    const width = block.width ?? 1600;
    const height = block.height ?? 900;
    return (
      <figure className="info-managed__figure">
        <Image
          className="info-managed__image"
          src={block.src}
          alt={block.alt}
          width={width}
          height={height}
          sizes="(max-width: 760px) 100vw, 900px"
          unoptimized={managed && privatePreview}
        />
        {block.caption ? <figcaption>{block.caption}</figcaption> : null}
      </figure>
    );
  }
  if (block.type === "link") {
    return (
      <p className="info-managed__link">
        <ManagedLink className="text-link" href={block.href}>
          {block.label} <span aria-hidden="true">↗</span>
        </ManagedLink>
      </p>
    );
  }
  return (
    <aside className="info-managed__cta" aria-label={block.heading}>
      <div>
        {block.eyebrow ? <p className="eyebrow">{block.eyebrow}</p> : null}
        <h2>{block.heading}</h2>
      </div>
      <div>
        <p>{block.body}</p>
        <div className="button-row">
          <ManagedLink className="button button--dark" href={block.primaryHref}>
            {block.primaryLabel} <span aria-hidden="true">→</span>
          </ManagedLink>
          {block.secondaryLabel && block.secondaryHref ? (
            <ManagedLink className="text-link" href={block.secondaryHref}>
              {block.secondaryLabel} <span aria-hidden="true">↗</span>
            </ManagedLink>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

export function InfoPageContentView({
  content,
  privatePreview = false,
}: {
  content: InfoPageContent;
  privatePreview?: boolean;
}) {
  return (
    <main className="info-page">
      <PageIntro eyebrow={content.eyebrow} title={content.title} tone="dark">
        <p>{content.introduction}</p>
      </PageIntro>

      <section className="info-managed section-pad" aria-label="About M&A Watch">
        <div className="site-shell info-managed__flow">
          {content.blocks.map((block, index) => (
            <InfoBlock block={block} privatePreview={privatePreview} key={`${block.type}-${index}`} />
          ))}
        </div>
      </section>
    </main>
  );
}
