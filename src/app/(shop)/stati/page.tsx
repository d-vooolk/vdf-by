import type { Metadata } from "next";
import Link from "next/link";

import { formatArticleDate } from "@/components/ArticleView";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { Picture } from "@/components/Picture";
import { coverOf } from "@/lib/article-photos";
import { ARTICLE_SECTIONS, articleSection } from "@/lib/article-sections";
import { articleUrl, getPublishedArticles, type Article } from "@/lib/articles";
import { getSite } from "@/lib/catalog";
import { getImage } from "@/lib/images";
import { absoluteUrl, buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  const site = getSite();
  return buildMetadata({
    title: "Статьи об автосвете: линзы, лампы, фары",
    description: `Как выбрать линзы, лампы и стёкла фар, чем отличаются би-LED и ксенон, что подходит к вашему авто — разборы и советы от ${site.name}.`,
    path: "/stati/",
    noIndex: getPublishedArticles().length === 0,
  });
}

interface ArticleGroup {
  id: string;
  label: string;
  intro?: string;
  catalog?: { href: string; label: string };
  articles: Article[];
}

function groupBySection(articles: Article[]): ArticleGroup[] {
  const groups: ArticleGroup[] = ARTICLE_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    intro: section.intro,
    catalog: section.catalog,
    articles: articles.filter((article) => article.section === section.id),
  }));
  const rest = articles.filter((article) => !articleSection(article.section));
  if (rest.length) groups.push({ id: "drugie", label: "Другие статьи", articles: rest });
  return groups.filter((group) => group.articles.length);
}

function ArticleCard({ article, priority }: { article: Article; priority: boolean }) {
  const cover = getImage(coverOf(article));
  return (
    <li className="card card-link flex flex-col overflow-hidden">
      <Link href={articleUrl(article)} className="flex flex-1 flex-col">
        {cover && (
          <Picture
            entry={cover}
            alt={article.title}
            sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
            className="aspect-[16/9] h-auto w-full object-cover"
            priority={priority}
          />
        )}
        <div className="flex flex-1 flex-col p-5">
          <h3 className="text-lg font-semibold text-brand-900">{article.title}</h3>
          {article.excerpt && <p className="mt-2 line-clamp-3 text-sm text-brand-500">{article.excerpt}</p>}
          <p className="mt-auto pt-3 text-xs text-brand-400">
            {formatArticleDate(article.publishedAt ?? article.updatedAt)}
          </p>
        </div>
      </Link>
    </li>
  );
}

export default function ArticlesIndexPage() {
  const articles = getPublishedArticles();
  const groups = groupBySection(articles);

  return (
    <div className="container-page">
      <Breadcrumbs items={[{ label: "Статьи" }]} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Blog",
          url: absoluteUrl("/stati/"),
          name: "Статьи об автосвете",
          inLanguage: "ru",
          blogPost: articles.slice(0, 30).map((article) => ({
            "@type": "BlogPosting",
            headline: article.title,
            url: absoluteUrl(articleUrl(article)),
            datePublished: new Date(article.publishedAt ?? article.createdAt).toISOString(),
          })),
        }}
      />

      <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">Статьи об автосвете</h1>
      <p className="mt-3 max-w-2xl text-brand-500">
        Разбираемся, как выбрать линзы, лампы и стёкла фар, что подходит к конкретной машине и как не
        ошибиться с покупкой.
      </p>

      {articles.length === 0 ? (
        <p className="mt-10 text-brand-400">Скоро здесь появятся первые статьи.</p>
      ) : (
        <>
          {groups.length > 1 && (
            <nav aria-label="Разделы статей" className="mt-6 flex flex-wrap gap-2">
              {groups.map((group) => (
                <a key={group.id} href={`#${group.id}`} className="rounded-full border border-brand-200 px-3 py-1 text-sm text-brand-700 hover:border-brand-400">
                  {group.label} · {group.articles.length}
                </a>
              ))}
            </nav>
          )}
          {groups.map((group, groupIndex) => (
            <section key={group.id} id={group.id} className="mt-12 scroll-mt-24">
              <h2 className="text-2xl font-semibold text-brand-900">{group.label}</h2>
              {group.intro && <p className="mt-2 max-w-3xl text-brand-500">{group.intro}</p>}
              {group.catalog && (
                <Link href={group.catalog.href} className="mt-2 inline-block text-sm font-medium text-brand-700 hover:text-brand-900">
                  {group.catalog.label} →
                </Link>
              )}
              <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {group.articles.map((article, index) => (
                  <ArticleCard key={article.id} article={article} priority={groupIndex === 0 && index === 0} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
