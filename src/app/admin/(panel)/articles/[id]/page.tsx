import { notFound } from "next/navigation";

import { ArticleForm } from "@/components/admin/ArticleForm";
import { thumbsFor } from "@/lib/admin-thumbs";
import { aiConfigured } from "@/lib/ai";
import { articleUsedImages, getArticle } from "@/lib/articles";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return { title: getArticle(Number(id))?.title ?? "Статья" };
}

export default async function EditArticlePage({ params }: PageProps) {
  const { id } = await params;
  const article = getArticle(Number(id));
  if (!article) notFound();

  return <ArticleForm article={article} thumbs={thumbsFor(articleUsedImages(article))} aiReady={aiConfigured()} />;
}
