import { notFound } from "next/navigation";

import { ArticleView } from "@/components/ArticleView";
import { getArticle } from "@/lib/articles";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Предпросмотр статьи" };

export default async function ArticlePreviewPage({ params }: PageProps) {
  const { id } = await params;
  const article = getArticle(Number(id));
  if (!article) notFound();

  return (
    <div className="rounded-card bg-white py-4">
      <p className="container-page mb-2 text-xs text-amber-800">
        Предпросмотр сохранённой версии. Пометки о фото здесь видны, на сайте — нет.
      </p>
      <ArticleView article={article} preview />
    </div>
  );
}
