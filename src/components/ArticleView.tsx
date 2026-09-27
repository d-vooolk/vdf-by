import Link from "next/link";

import { Faq } from "@/components/Faq";
import { Picture } from "@/components/Picture";
import { ProductCard } from "@/components/ProductCard";
import {
  articleHeadings,
  articleProductSlugs,
  parseArticleBody,
  parseInline,
  PRODUCT_LINK,
  readingMinutes,
  type ArticleBlock,
} from "@/lib/article-body";
import type { Article } from "@/lib/articles";
import { getProductBySlug, getSite } from "@/lib/catalog";
import { getImage } from "@/lib/images";
import type { Product } from "@/lib/schema";

interface ArticleViewProps {
  article: Article;
  preview?: boolean;
}

export function formatArticleDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, index) => {
        if (part.type === "text") return part.text;
        if (part.type === "bold") {
          return (
            <strong key={index} className="font-semibold text-brand-900">
              {part.text}
            </strong>
          );
        }
        const product = part.href.match(PRODUCT_LINK);
        if (product && !getProductBySlug(product[1])) return part.text;
        if (!part.href.startsWith("/")) return part.text;
        return (
          <Link key={index} href={part.href} className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-700">
            {part.text}
          </Link>
        );
      })}
    </>
  );
}

function Block({
  block,
  title,
  preview,
  currencySymbol,
}: {
  block: ArticleBlock;
  title: string;
  preview: boolean;
  currencySymbol: string;
}) {
  switch (block.type) {
    case "h2":
      return (
        <h2 id={block.id} className="mt-10 mb-3 scroll-mt-24 text-2xl font-semibold text-brand-900">
          <Inline text={block.text} />
        </h2>
      );
    case "h3":
      return (
        <h3 id={block.id} className="mt-7 mb-2 scroll-mt-24 text-lg font-semibold text-brand-900">
          <Inline text={block.text} />
        </h3>
      );
    case "p":
      return (
        <p className="mt-4">
          <Inline text={block.text} />
        </p>
      );
    case "tip":
      return (
        <aside className="mt-5 rounded-xl border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-brand-800">
          <Inline text={block.text} />
        </aside>
      );
    case "ul":
    case "ol": {
      const List = block.type;
      return (
        <List className={`mt-4 space-y-1.5 pl-5 ${block.type === "ul" ? "list-disc" : "list-decimal"} marker:text-brand-400`}>
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline text={item} />
            </li>
          ))}
        </List>
      );
    }
    case "table":
      return (
        <div className="mt-5 overflow-x-auto rounded-xl border border-brand-100">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-brand-50 text-brand-900">
              <tr>
                {block.head.map((cell, index) => (
                  <th key={index} scope="col" className="px-3 py-2 font-semibold">
                    <Inline text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100">
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index} className="px-3 py-2 align-top">
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "image": {
      const entry = getImage(block.path);
      if (!entry) return null;
      const alt = block.alt || (block.heading ? `${block.heading} — ${title}` : title);
      return (
        <figure className="mt-6">
          <Picture
            entry={entry}
            alt={alt}
            sizes="(min-width: 800px) 760px, 100vw"
            className="h-auto w-full rounded-xl"
          />
          {block.alt && <figcaption className="mt-2 text-sm text-brand-400">{block.alt}</figcaption>}
        </figure>
      );
    }
    case "placeholder":
      if (!preview) return null;
      return (
        <p className="mt-5 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900">
          Здесь будет фото: {block.text}
        </p>
      );
    case "products": {
      const products = block.slugs
        .map((slug) => getProductBySlug(slug))
        .filter((product): product is Product => Boolean(product));
      if (!products.length) return null;
      return (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} currencySymbol={currencySymbol} />
          ))}
        </div>
      );
    }
  }
}

export function ArticleView({ article, preview = false }: ArticleViewProps) {
  const site = getSite();
  const blocks = parseArticleBody(article.body);
  const headings = articleHeadings(article.body);
  const cover = getImage(article.cover);
  const minutes = readingMinutes(article.body);
  const date = article.publishedAt ?? article.updatedAt;
  const updated = article.updatedAt - date > 24 * 60 * 60 * 1000;

  const carded = new Set(
    blocks.flatMap((block) => (block.type === "products" ? block.slugs : [])),
  );
  const mentioned = articleProductSlugs(article.body)
    .filter((slug) => !carded.has(slug))
    .map((slug) => getProductBySlug(slug))
    .filter((product): product is Product => Boolean(product))
    .slice(0, 10);

  return (
    <article className="container-page max-w-[820px]">
      <header>
        <h1 className="text-3xl font-semibold text-brand-900 lg:text-[2.25rem] lg:leading-[1.15]">
          {article.title}
        </h1>
        <p className="mt-3 text-sm text-brand-400">
          <time dateTime={new Date(date).toISOString()}>{formatArticleDate(date)}</time>
          {updated && (
            <>
              {" · обновлено "}
              <time dateTime={new Date(article.updatedAt).toISOString()}>
                {formatArticleDate(article.updatedAt)}
              </time>
            </>
          )}
          {` · ${minutes} мин чтения · ${site.name}`}
        </p>
      </header>

      {cover && (
        <div className="mt-6">
          <Picture
            entry={cover}
            alt={article.title}
            sizes="(min-width: 860px) 820px, 100vw"
            className="h-auto w-full rounded-card"
            priority
          />
        </div>
      )}

      {article.excerpt && (
        <p className="mt-6 text-lg leading-relaxed text-brand-800">{article.excerpt}</p>
      )}

      {headings.length >= 3 && (
        <nav aria-label="Содержание" className="mt-8 rounded-card border border-brand-100 bg-brand-50/50 p-5">
          <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-brand-400 uppercase">Содержание</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm marker:text-brand-300">
            {headings.map((heading) => (
              <li key={heading.id}>
                <a href={`#${heading.id}`} className="text-brand-700 hover:underline">
                  {heading.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="mt-4 text-base leading-relaxed text-brand-600">
        {blocks.map((block, index) => (
          <Block
            key={index}
            block={block}
            title={article.title}
            preview={preview}
            currencySymbol={site.currencySymbol}
          />
        ))}
      </div>

      {mentioned.length > 0 && (
        <section className="mt-14 border-t border-brand-100 pt-10">
          <h2 className="mb-6 text-xl font-semibold text-brand-900">Товары из статьи</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {mentioned.map((product) => (
              <ProductCard key={product.id} product={product} currencySymbol={site.currencySymbol} />
            ))}
          </div>
        </section>
      )}

      <Faq items={article.faq} schema={!preview} />
    </article>
  );
}
