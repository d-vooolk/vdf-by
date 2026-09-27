import { z } from "zod";

import { articleImagePaths, articleLinks, articleProductSlugs } from "./article-body";
import { bumpCounter, counterValue, getDb } from "./db";
import { rememberRedirect } from "./redirects";
import { faqItemSchema, imagePath, slug } from "./schema";
import { describe } from "./store";
import { deepTrim } from "./text";

export const ARTICLES_ROOT = "/stati/";

export type ArticleStatus = "draft" | "published";

export const articleDataSchema = z.strictObject({
  slug,
  title: z.string().min(1, "нужен заголовок").max(200),
  excerpt: z.string().max(600).optional(),
  body: z.string().max(200000),
  cover: imagePath.optional(),
  images: z.array(imagePath).max(60).default([]),
  seoTitle: z.string().max(120).optional(),
  seoDescription: z.string().max(300).optional(),
  faq: z.array(faqItemSchema).max(20).default([]),
  topic: z.string().max(500).optional(),
  notes: z.string().max(4000).optional(),
  keyword: z.string().max(200).optional(),
  seoReview: z
    .strictObject({
      score: z.number().int().min(0).max(100),
      notes: z.array(z.string().max(600)).max(30),
      revised: z.boolean(),
      at: z.number().int(),
    })
    .optional(),
});

export type ArticleData = z.infer<typeof articleDataSchema>;

export interface Article extends ArticleData {
  id: number;
  status: ArticleStatus;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
}

interface ArticleRow {
  id: number;
  slug: string;
  status: string;
  data: string;
  created_at: number;
  updated_at: number;
  published_at: number | null;
}

export function articleUrl(article: Pick<ArticleData, "slug">): string {
  return `${ARTICLES_ROOT}${article.slug}/`;
}

function fromRow(row: ArticleRow): Article {
  const data = articleDataSchema.parse(JSON.parse(row.data));
  return {
    ...data,
    slug: row.slug,
    id: row.id,
    status: row.status === "published" ? "published" : "draft",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

const articlesVersion = () => counterValue("articles");
const bumpArticlesVersion = () => bumpCounter("articles");

let published: { version: number; articles: Article[] } | null = null;

export function getPublishedArticles(): Article[] {
  const version = articlesVersion();
  if (published?.version === version) return published.articles;
  const rows = getDb()
    .prepare("SELECT * FROM articles WHERE status = 'published' ORDER BY published_at DESC, id DESC")
    .all() as ArticleRow[];
  published = { version, articles: rows.map(fromRow) };
  return published.articles;
}

export function getPublishedArticle(articleSlug: string): Article | undefined {
  return getPublishedArticles().find((article) => article.slug === articleSlug);
}

export function listArticles(): Article[] {
  const rows = getDb()
    .prepare("SELECT * FROM articles ORDER BY updated_at DESC, id DESC")
    .all() as ArticleRow[];
  return rows.map(fromRow);
}

export function getArticle(id: number): Article | null {
  const row = getDb().prepare("SELECT * FROM articles WHERE id = ?").get(id) as ArticleRow | undefined;
  return row ? fromRow(row) : null;
}

export function articlesForProduct(productSlug: string, limit = 3): Article[] {
  return getPublishedArticles()
    .filter((article) => articleProductSlugs(article.body).includes(productSlug))
    .slice(0, limit);
}

export function articlesForCategory(
  categoryPath: string,
  productSlugs: Set<string>,
  limit = 3,
): Article[] {
  return getPublishedArticles()
    .filter(
      (article) =>
        articleLinks(article.body).some((href) => normalizePath(href) === categoryPath) ||
        articleProductSlugs(article.body).some((productSlug) => productSlugs.has(productSlug)),
    )
    .slice(0, limit);
}

function normalizePath(href: string): string {
  const path = href.split(/[?#]/)[0];
  return path.endsWith("/") ? path : `${path}/`;
}

export function articleCategoryLinks(body: string): string[] {
  return [
    ...new Set(
      articleLinks(body)
        .filter((href) => href.startsWith("/catalog/"))
        .map(normalizePath),
    ),
  ];
}

export function articleUsedImages(article: Pick<ArticleData, "body" | "cover" | "images">): string[] {
  return [
    ...new Set([
      ...(article.cover ? [article.cover] : []),
      ...article.images,
      ...articleImagePaths(article.body),
    ]),
  ];
}

export type ArticleSaveResult =
  | { ok: true; id: number; previous: Article | null; article: Article }
  | { ok: false; problems: string[] };

export function saveArticle(
  input: unknown,
  status: ArticleStatus,
  id?: number,
): ArticleSaveResult {
  const parsed = articleDataSchema.safeParse(deepTrim(input));
  if (!parsed.success) return { ok: false, problems: describe(parsed.error.issues) };
  const data = parsed.data;
  const db = getDb();

  const taken = db
    .prepare("SELECT id FROM articles WHERE slug = ? AND id IS NOT ?")
    .get(data.slug, id ?? null) as { id: number } | undefined;
  if (taken) return { ok: false, problems: [`Адрес «${data.slug}» уже занят другой статьёй`] };

  const previous = id ? getArticle(id) : null;
  if (id && !previous) return { ok: false, problems: ["Статья не найдена — возможно, её удалили"] };

  const now = Date.now();
  const publishedAt =
    status === "published" ? (previous?.publishedAt ?? now) : (previous?.publishedAt ?? null);

  let savedId = id;
  if (previous) {
    db.prepare(
      `UPDATE articles SET slug = ?, title = ?, status = ?, data = ?, updated_at = ?, published_at = ?
        WHERE id = ?`,
    ).run(data.slug, data.title, status, JSON.stringify(data), now, publishedAt, id);
  } else {
    const result = db
      .prepare(
        `INSERT INTO articles (slug, title, status, data, created_at, updated_at, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(data.slug, data.title, status, JSON.stringify(data), now, now, publishedAt);
    savedId = Number(result.lastInsertRowid);
  }

  if (previous && previous.status === "published" && previous.slug !== data.slug) {
    rememberRedirect(articleUrl(previous), articleUrl(data));
  }

  bumpArticlesVersion();
  return { ok: true, id: savedId!, previous, article: getArticle(savedId!)! };
}

export function deleteArticle(id: number): Article | null {
  const article = getArticle(id);
  if (!article) return null;
  getDb().prepare("DELETE FROM articles WHERE id = ?").run(id);
  bumpArticlesVersion();
  return article;
}

export function uniqueArticleSlug(base: string, exceptId?: number): string {
  const db = getDb();
  const root = base || "statya";
  let candidate = root;
  for (let n = 2; ; n += 1) {
    const taken = db
      .prepare("SELECT id FROM articles WHERE slug = ? AND id IS NOT ?")
      .get(candidate, exceptId ?? null);
    if (!taken) return candidate;
    candidate = `${root}-${n}`;
  }
}

export function allArticleImagePaths(): string[] {
  return listArticles().flatMap(articleUsedImages);
}

export function articleImageUsage(path: string): string[] {
  return listArticles()
    .filter((article) => articleUsedImages(article).includes(path))
    .map((article) => `статья «${article.title}»`);
}
