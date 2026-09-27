import Link from "next/link";

import { articleUrl, type Article } from "@/lib/articles";

export function RelatedArticles({ articles, title = "Статьи по теме" }: { articles: Article[]; title?: string }) {
  if (!articles.length) return null;

  return (
    <section className="mt-14 border-t border-brand-100 pt-10">
      <h2 className="mb-5 text-xl font-semibold text-brand-900">{title}</h2>
      <ul className="grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <li key={article.id} className="card card-link p-4">
            <Link href={articleUrl(article)} className="font-semibold text-brand-900 hover:text-brand-700">
              {article.title}
            </Link>
            {article.excerpt && <p className="mt-1 line-clamp-2 text-sm text-brand-500">{article.excerpt}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
