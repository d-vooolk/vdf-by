import Link from "next/link";

import { articlePlaceholders, articlePlainText } from "@/lib/article-body";
import { listArticles } from "@/lib/articles";

export const metadata = { title: "Статьи" };

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ArticlesPage() {
  const articles = listArticles();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-brand-900">
            Статьи <span className="tnum text-base font-medium text-brand-400">{articles.length}</span>
          </h1>
          <p className="mt-1 text-sm text-brand-400">
            Полезные тексты об автосвете: приводят людей из поиска и попадают в ответы нейросетей.
          </p>
        </div>
        <Link href="/admin/articles/new/" className="btn-primary py-2 text-sm">
          Новая статья
        </Link>
      </div>

      {articles.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          Статей пока нет. Задайте тему — нейросеть напишет черновик за пару минут.
        </p>
      ) : (
        <div className="card divide-y divide-brand-100 overflow-hidden">
          {articles.map((article) => {
            const photos = articlePlaceholders(article.body).length;
            const length = articlePlainText(article.body).length;
            return (
              <div key={article.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/articles/${article.id}/`}
                    className="block truncate text-sm font-semibold text-brand-900 hover:text-brand-700"
                  >
                    {article.title}
                  </Link>
                  <p className="truncate text-xs text-brand-400">
                    /stati/{article.slug}/ · {length.toLocaleString("ru-RU")} знаков · изменена{" "}
                    {formatDate(article.updatedAt)}
                    {article.publishedAt ? ` · опубликована ${formatDate(article.publishedAt)}` : ""}
                  </p>
                </div>
                {photos > 0 && (
                  <span className="badge bg-amber-100 text-amber-900">нужно фото: {photos}</span>
                )}
                <span
                  className={`badge ${
                    article.status === "published" ? "bg-green-100 text-green-800" : "bg-brand-100 text-brand-600"
                  }`}
                >
                  {article.status === "published" ? "опубликована" : "черновик"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
