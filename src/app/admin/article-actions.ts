"use server";

import { redirect } from "next/navigation";

import { slugForTitle } from "@/lib/article-ai";
import { articleProductSlugs } from "@/lib/article-body";
import {
  articleCategoryLinks,
  articleUrl,
  deleteArticle,
  saveArticle,
  uniqueArticleSlug,
  type Article,
  type ArticleStatus,
} from "@/lib/articles";
import { thumbsFor } from "@/lib/admin-thumbs";
import { requireAdmin } from "@/lib/auth";
import { categoryPaths, getProductBySlug } from "@/lib/catalog";
import { revalidateArticle } from "@/lib/revalidate";
import { listProducts } from "@/lib/store";

export type ArticleActionResult =
  | { ok: true; id: number; slug: string }
  | { ok: false; problems: string[] };

function touchedPaths(articles: Array<Article | null>) {
  const products = new Set<string>();
  const categories = new Set<string>();
  for (const article of articles) {
    if (!article || article.status !== "published") continue;
    for (const slug of articleProductSlugs(article.body)) {
      products.add(slug);
      const product = getProductBySlug(slug);
      if (product) for (const path of categoryPaths(product.categoryId)) categories.add(path);
    }
    for (const path of articleCategoryLinks(article.body)) categories.add(path);
  }
  return { products: [...products], categories: [...categories] };
}

export async function saveArticleAction(
  input: unknown,
  status: ArticleStatus,
  id?: number,
): Promise<ArticleActionResult> {
  await requireAdmin();
  const result = saveArticle(input, status === "published" ? "published" : "draft", id);
  if (!result.ok) return result;

  const { article, previous } = result;
  if (article.status === "published" || previous?.status === "published") {
    revalidateArticle(
      {
        article: articleUrl(article),
        previous: previous ? articleUrl(previous) : undefined,
        ...touchedPaths([article, previous]),
      },
      article.status === "published",
    );
  }
  return { ok: true, id: article.id, slug: article.slug };
}

export async function createArticleDraftAction(input: Record<string, unknown>): Promise<ArticleActionResult> {
  await requireAdmin();
  const title = typeof input.title === "string" ? input.title : "";
  const requested = typeof input.slug === "string" ? input.slug : "";
  const slug = uniqueArticleSlug(requested || slugForTitle(title));
  const result = saveArticle({ ...input, slug }, "draft");
  if (!result.ok) return result;
  return { ok: true, id: result.id, slug };
}

export async function deleteArticleAction(id: number): Promise<void> {
  await requireAdmin();
  const article = deleteArticle(id);
  if (article?.status === "published") {
    revalidateArticle({ article: articleUrl(article), ...touchedPaths([article]) }, false);
  }
  redirect("/admin/articles/");
}

export interface ProductChoice {
  slug: string;
  title: string;
  thumb: string | null;
}

export async function searchProductsAction(query: string): Promise<ProductChoice[]> {
  await requireAdmin();
  const text = typeof query === "string" ? query.trim().slice(0, 100) : "";
  if (text.length < 2) return [];
  const { rows } = listProducts({ query: text, limit: 12 });
  const thumbs = thumbsFor(rows.flatMap((row) => (row.image ? [row.image] : [])));
  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    thumb: row.image ? (thumbs[row.image] ?? null) : null,
  }));
}
