import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { ArticleView, formatArticleDate } from "@/components/ArticleView";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { articleUrl, getPublishedArticle, getPublishedArticles } from "@/lib/articles";
import { findRedirect } from "@/lib/redirects";
import { articleJsonLd, buildMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return getPublishedArticles().map((article) => ({ slug: article.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getPublishedArticle(slug);
  if (!article) return {};

  return buildMetadata({
    title: article.seoTitle || article.title,
    description: article.seoDescription || article.excerpt || article.title,
    path: articleUrl(article),
    image: article.cover,
    article: {
      publishedTime: new Date(article.publishedAt ?? article.createdAt).toISOString(),
      modifiedTime: new Date(article.updatedAt).toISOString(),
    },
  });
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = getPublishedArticle(slug);
  if (!article) {
    const target = findRedirect(`/stati/${slug}/`);
    if (target) permanentRedirect(target);
    notFound();
  }

  const others = getPublishedArticles()
    .filter((entry) => entry.id !== article.id)
    .slice(0, 4);

  return (
    <>
      <div className="container-page max-w-[820px]">
        <Breadcrumbs items={[{ label: "Статьи", href: "/stati/" }, { label: article.title }]} />
      </div>
      <JsonLd data={articleJsonLd(article)} />
      <ArticleView article={article} />

      {others.length > 0 && (
        <section className="container-page mt-14 max-w-[820px] border-t border-brand-100 pt-10">
          <h2 className="mb-5 text-xl font-semibold text-brand-900">Ещё статьи</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {others.map((entry) => (
              <li key={entry.id} className="card card-link p-4">
                <Link href={articleUrl(entry)} className="font-semibold text-brand-900 hover:text-brand-700">
                  {entry.title}
                </Link>
                <p className="mt-1 text-xs text-brand-400">
                  {formatArticleDate(entry.publishedAt ?? entry.updatedAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
