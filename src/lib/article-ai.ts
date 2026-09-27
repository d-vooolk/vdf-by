import { cleanPlainText, parseFaq } from "./ai";
import { PRODUCT_LINK, parseInline } from "./article-body";
import { articleUrl, getPublishedArticles, type ArticleData } from "./articles";
import { categoryUrl, getCategories, getCategoryCounts, getProducts, getSite } from "./catalog";
import { formatPrice } from "./format";
import type { Product } from "./schema";
import { toSlug } from "./slug.mjs";
import { hasAnyInStock, hasPrice, priceRange } from "./variant";

export interface ArticleRequest {
  topic: string;
  notes?: string;
  keyword?: string;
  prompt?: string;
}

export type GeneratedArticle = Pick<
  ArticleData,
  "title" | "excerpt" | "body" | "seoTitle" | "seoDescription" | "faq"
>;

const MAX_CANDIDATES = 40;
const STOP_WORDS = new Set([
  "как", "для", "что", "это", "или", "при", "без", "под", "над", "про", "чем", "где",
  "какой", "какая", "какие", "выбрать", "лучше", "статья", "нужно", "надо", "есть",
  "the", "and",
]);

function stems(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/ё/g, "е")
        .split(/[^a-zа-я0-9]+/i)
        .filter((word) => word.length >= 2 && !STOP_WORDS.has(word))
        .map((word) => (/^[а-я]+$/.test(word) && word.length > 5 ? word.slice(0, word.length - 2) : word)),
    ),
  ];
}

function mentionedSlugs(text: string): string[] {
  return [...text.matchAll(/\/product\/([a-z0-9-]+)/g)].map((match) => match[1]);
}

export function pickCandidates(request: ArticleRequest): Product[] {
  const products = getProducts();
  const categories = new Map(getCategories().map((category) => [category.id, category]));
  const query = stems([request.topic, request.notes, request.keyword].filter(Boolean).join(" "));
  const forced = new Set(mentionedSlugs(`${request.topic} ${request.notes ?? ""}`));

  const scored = products.map((product) => {
    const category = categories.get(product.categoryId);
    const parent = category?.parentId ? categories.get(category.parentId) : undefined;
    const haystack = [product.title, product.brand, category?.name, parent?.name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .replace(/ё/g, "е");
    let score = 0;
    for (const stem of query) if (haystack.includes(stem)) score += stem.length > 3 ? 2 : 1;
    if (hasAnyInStock(product)) score += 0.5;
    if (!hasPrice(priceRange(product).min)) score -= 1;
    if (forced.has(product.slug)) score += 100;
    return { product, score };
  });

  const relevant = scored
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.product);

  if (relevant.length >= 8) return relevant.slice(0, MAX_CANDIDATES);

  const featured = products.filter((product) => product.featured && hasAnyInStock(product));
  return [...new Set([...relevant, ...featured, ...products.filter(hasAnyInStock)])].slice(0, MAX_CANDIDATES);
}

function productLine(product: Product, currencySymbol: string, categoryName: string): string {
  const range = priceRange(product);
  const price = hasPrice(range.min)
    ? `${range.varies ? "от " : ""}${formatPrice(range.min, currencySymbol)}`
    : "цена по запросу";
  const stock = hasAnyInStock(product) ? "в наличии" : "под заказ";
  return `- ${product.slug} — ${product.title} (${categoryName}; ${price}; ${stock})`;
}

export function describeArticleRequest(request: ArticleRequest, candidates: Product[]): string {
  const site = getSite();
  const categories = getCategories();
  const byId = new Map(categories.map((category) => [category.id, category]));
  const counts = getCategoryCounts();

  const lines = [
    `Тема статьи: ${request.topic.trim()}`,
    ...(request.keyword?.trim() ? [`Главный поисковый запрос: ${request.keyword.trim()}`] : []),
    ...(request.notes?.trim() ? ["", "Нюансы и пожелания:", request.notes.trim()] : []),
    "",
    "О магазине:",
    `- ${site.name} — магазин автомобильного света, ${site.address.city}, доставка по всей Беларуси`,
    "- каждую линзу и блок розжига проверяем на стенде перед отправкой",
    "- менеджер подтверждает совместимость с автомобилем до отправки, оплата при получении",
    ...(site.warranty ? [`- гарантия: ${site.warranty}`] : []),
    ...(site.returnDays ? [`- возврат в течение ${site.returnDays} дней`] : []),
    "",
    "Разделы каталога (адрес — название, товаров):",
    ...categories
      .filter((category) => (counts[category.id] ?? 0) > 0 || !category.parentId)
      .map((category) => `- ${categoryUrl(category)} — ${category.name} (${counts[category.id] ?? 0})`),
    "",
    "Товары, на которые можно ссылаться (адрес — название, раздел, цена, наличие):",
    ...candidates.map((product) =>
      productLine(product, site.currencySymbol, byId.get(product.categoryId)?.name ?? ""),
    ),
  ];

  const articles = getPublishedArticles().slice(0, 30);
  if (articles.length) {
    lines.push(
      "",
      "Уже опубликованные статьи — не повторяй их, можно сослаться по адресу:",
      ...articles.map((article) => `- ${articleUrl(article)} — ${article.title}`),
    );
  }
  return lines.join("\n");
}

function field(text: string, names: string[]): string {
  for (const name of names) {
    const match = text.match(new RegExp(`^\\s*\\**${name}\\**\\s*:\\s*(.+)$`, "im"));
    if (match) return unquote(cleanPlainText(match[1].replace(/\*+/g, "")));
  }
  return "";
}

function unquote(text: string): string {
  return text.trim().replace(/^["«„]+|["»“]+$/g, "").trim();
}

function sameText(a: string, b: string): boolean {
  const normalize = (value: string) => unquote(value.replace(/\*+/g, "")).toLowerCase();
  return normalize(a) === normalize(b);
}

function section(text: string, marker: string, next?: string): string {
  const start = text.search(new RegExp(`^\\s*=+\\s*${marker}\\s*=+\\s*$`, "im"));
  if (start < 0) return "";
  const rest = text.slice(start).replace(/^[^\n]*\n/, "");
  if (!next) return rest;
  const end = rest.search(new RegExp(`^\\s*=+\\s*${next}\\s*=+\\s*$`, "im"));
  return end < 0 ? rest : rest.slice(0, end);
}

function knownPaths(): Set<string> {
  return new Set([
    "/",
    "/catalog/",
    "/podbor/",
    "/delivery/",
    "/about/",
    "/contacts/",
    "/stati/",
    ...getCategories().map(categoryUrl),
    ...getProducts().map((product) => `/product/${product.slug}/`),
    ...getPublishedArticles().map(articleUrl),
  ]);
}

function withSlash(href: string): string {
  const path = href.split(/[?#]/)[0];
  return path.endsWith("/") ? path : `${path}/`;
}

export function sanitizeArticleBody(body: string, title: string): string {
  const known = knownPaths();
  const productSlugs = new Set(getProducts().map((product) => product.slug));

  const fixLinks = (line: string) =>
    parseInline(line)
      .map((part) => {
        if (part.type === "bold") return `**${part.text}**`;
        if (part.type === "text") return part.text;
        const href = part.href.replace(/^https?:\/\/(www\.)?vdf\.by/i, "");
        const productMatch = withSlash(href).match(PRODUCT_LINK);
        if (productMatch && productSlugs.has(productMatch[1])) return `[${part.text}](/product/${productMatch[1]}/)`;
        if (href.startsWith("/") && known.has(withSlash(href))) return `[${part.text}](${withSlash(href)})`;
        return part.text;
      })
      .join("");

  return body
    .replace(/\r\n/g, "\n")
    .replace(/^```[a-z]*\s*$/gim, "")
    .split("\n")
    .filter((line) => {
      const heading = line.match(/^#\s+(.+)$/);
      return !heading || !sameText(heading[1], title);
    })
    .map((line) => line.replace(/^#\s+/, "## "))
    .map((line) => {
      const product = line.trim().match(/^\{\{\s*товар\s*:\s*([a-z0-9-]+)\s*\}\}$/i);
      if (product) return productSlugs.has(product[1].toLowerCase()) ? `{{товар:${product[1].toLowerCase()}}}` : "";
      if (/^!\[|^\[\[/.test(line.trim())) return line;
      return fixLinks(line);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseGeneratedArticle(text: string, request: ArticleRequest): GeneratedArticle {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const bodyStart = cleaned.search(/^\s*=+\s*ТЕКСТ\s*=+\s*$/im);
  const header = bodyStart < 0 ? cleaned.slice(0, 1500) : cleaned.slice(0, bodyStart);
  const title = field(header, ["ЗАГОЛОВОК"]) || request.topic.trim();
  const rawBody = section(cleaned, "ТЕКСТ", "ВОПРОСЫ") || stripHeader(cleaned);
  const faqText = section(cleaned, "ВОПРОСЫ");

  let faq: GeneratedArticle["faq"] = [];
  if (faqText.includes("[")) {
    try {
      faq = parseFaq(faqText).slice(0, 8);
    } catch {
      faq = [];
    }
  }

  return {
    title: title.slice(0, 200),
    seoTitle: field(header, ["SEO_ЗАГОЛОВОК", "SEO ЗАГОЛОВОК"]).slice(0, 120) || undefined,
    seoDescription: field(header, ["SEO_ОПИСАНИЕ", "SEO ОПИСАНИЕ"]).slice(0, 300) || undefined,
    excerpt: field(header, ["АННОТАЦИЯ"]).slice(0, 600) || undefined,
    body: sanitizeArticleBody(rawBody, title),
    faq,
  };
}

function stripHeader(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*\**(ЗАГОЛОВОК|SEO_ЗАГОЛОВОК|SEO_ОПИСАНИЕ|АННОТАЦИЯ)\**\s*:/i.test(line))
    .join("\n");
}

export function slugForTitle(title: string): string {
  return toSlug(title).slice(0, 70).replace(/-+$/, "");
}
