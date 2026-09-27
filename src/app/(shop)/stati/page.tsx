import type { Metadata } from "next";
import Link from "next/link";

import { formatArticleDate } from "@/components/ArticleView";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { Picture } from "@/components/Picture";
import { articleUrl, getPublishedArticles } from "@/lib/articles";
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

export default function ArticlesIndexPage() {
  const articles = getPublishedArticles();

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
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article, index) => {
            const cover = getImage(article.cover);
            return (
              <li key={article.id} className="card card-link flex flex-col overflow-hidden">
                <Link href={articleUrl(article)} className="flex flex-1 flex-col">
                  {cover && (
                    <Picture
                      entry={cover}
                      alt={article.title}
                      sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
                      className="aspect-[16/9] h-auto w-full object-cover"
                      priority={index === 0}
                    />
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="text-lg font-semibold text-brand-900">{article.title}</h2>
                    {article.excerpt && (
                      <p className="mt-2 line-clamp-3 text-sm text-brand-500">{article.excerpt}</p>
                    )}
                    <p className="mt-auto pt-3 text-xs text-brand-400">
                      {formatArticleDate(article.publishedAt ?? article.updatedAt)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
