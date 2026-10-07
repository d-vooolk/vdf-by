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

export function canonicalText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/(?:би|bi)[\s-]*(?:лед|led)|билед/gi, "biled")
    .replace(/(?:би|bi)[\s-]*(?:ксенон|xenon)|биксенон/gi, "bixenon");
}

function stems(text: string): string[] {
  return [
    ...new Set(
      canonicalText(text)
        .split(/[^a-zа-я0-9]+/i)
        .filter((word) => (/\d/.test(word) ? word.length >= 2 : word.length >= 3) && !STOP_WORDS.has(word))
        .map((word) => (/^[а-я]+$/.test(word) && word.length > 5 ? word.slice(0, word.length - 2) : word)),
    ),
  ];
}

function linkedCategorySlugs(text: string): Set<string> {
  return new Set([...text.matchAll(/\/catalog\/(?:[a-z0-9-]+\/)*([a-z0-9-]+)\//g)].map((match) => match[1]));
}

function mentionedSlugs(text: string): string[] {
  return [...text.matchAll(/\/product\/([a-z0-9-]+)/g)].map((match) => match[1]);
}

export function requestedProducts(request: ArticleRequest): Product[] {
  const products = new Map(getProducts().map((product) => [product.slug, product]));
  return [...new Set(mentionedSlugs(`${request.topic} ${request.notes ?? ""}`))]
    .map((slug) => products.get(slug))
    .filter((product): product is Product => Boolean(product));
}

export function pickCandidates(request: ArticleRequest): Product[] {
  const requested = requestedProducts(request);
  if (requested.length) return requested;
  const products = getProducts();
  const categories = new Map(getCategories().map((category) => [category.id, category]));
  const primary = stems([request.topic, request.keyword].filter(Boolean).join(" "));
  const secondary = stems(request.notes ?? "").filter((stem) => !primary.includes(stem));
  const linked = linkedCategorySlugs(`${request.topic} ${request.notes ?? ""}`);
  const forced = new Set(mentionedSlugs(`${request.topic} ${request.notes ?? ""}`));

  const scored = products.map((product) => {
    const category = categories.get(product.categoryId);
    const parent = category?.parentId ? categories.get(category.parentId) : undefined;
    const haystack = canonicalText([product.title, product.brand, category?.name, parent?.name].filter(Boolean).join(" "));
    const categoryText = canonicalText([category?.name, parent?.name].filter(Boolean).join(" "));
    let score = 0;
    for (const stem of primary) {
      if (haystack.includes(stem)) score += stem.length > 3 ? 3 : 1.5;
      if (categoryText.includes(stem)) score += 2;
    }
    for (const stem of secondary) if (haystack.includes(stem)) score += stem.length > 3 ? 1 : 0.5;
    if ((category && linked.has(category.slug)) || (parent && linked.has(parent.slug))) score += 2;
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

const PRODUCT_RULES = `Как подавать товары в статье:
- Каждый товар — в том разделе, где он отвечает на вопрос раздела: например, компактный модуль — там, где речь о тесных фарах, самый яркий — там, где речь о максимальном свете.
- Перед карточкой {{товар:адрес}} всегда абзац-подводка: для какой задачи и каких машин подходит этот товар, чем он отличается от остальных, цена. В подводке — ссылка на товар по названию. Карточка идёт сразу после подводки.
- Одна карточка на товар за всю статью. Две карточки подряд — только в разделе сравнения или выбора, после абзаца, который объясняет, чем они различаются.
- Не перечисляй товары списком ради перечисления и не выводи весь ассортимент. Если нужно сравнение — сделай таблицу только по товарам статьи.
- В последнем разделе коротко подведи итог: какой из товаров статьи кому подходит.`;

function productDetails(product: Product, currencySymbol: string, categoryName: string): string[] {
  const specs = product.specs.slice(0, 10).map((spec) => `${spec.name}: ${spec.value}`).join("; ");
  const about = (product.description ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  return [
    productLine(product, currencySymbol, categoryName),
    ...(product.brand ? [`  бренд: ${product.brand}`] : []),
    ...(specs ? [`  характеристики: ${specs}`] : []),
    ...(about ? [`  описание: ${about}`] : []),
  ];
}

const SHOP_POSITION = `Позиция магазина. Статья не должна ей противоречить, но это не тезисы для вставки: пункт упоминай, только если он прямо относится к теме, и своими словами, не повторяя формулировки дословно:
- Фары собирают только на бутиловый герметик. Силиконовые герметики, полиуретановые клеи, эпоксидка, суперклей и термоклей для этого не годятся: фару потом не разобрать, пары мутят поликарбонат и отражатель, шов трескается от перепадов температуры. Единственная допустимая альтернатива бутилу — составы Kafuter для фар.
- Обычные светодиодные лампы в рефлекторные фары головного света не ставят: нет светотеневой границы, свет рассеивается и слепит встречных. Яркий свет в такой фаре даёт би-LED линза на переходной рамке с регулировкой.
- Полировка стекла без нового защитного покрытия держится примерно сезон. Трещины и сколы стекла не ремонтируются — стекло меняют.
- Сроки, цены и состав работ мастерской не называй, если их нет в данных выше, — предлагай уточнить у мастера.`;

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
  ];

  const requested = requestedProducts(request).length > 0;
  if (requested) {
    lines.push(
      "",
      `Товары, вокруг которых строится статья (${candidates.length}). Карточками, фото и ссылками показывай ТОЛЬКО их, другие товары магазина не упоминай и не перечисляй:`,
      ...candidates.flatMap((product) => productDetails(product, site.currencySymbol, byId.get(product.categoryId)?.name ?? "")),
    );
  } else {
    lines.push(
      "",
      "Товары, на которые можно ссылаться (адрес — название, раздел, цена, наличие). Это запас для выбора, а не список для перечисления: возьми 2–5 самых подходящих к теме, остальные не упоминай:",
      ...candidates.map((product) =>
        productLine(product, site.currencySymbol, byId.get(product.categoryId)?.name ?? ""),
      ),
    );
  }

  lines.push("", PRODUCT_RULES, "", SHOP_POSITION);

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

const LOOKALIKES: Record<string, string> = {
  А: "АA", В: "ВB", Е: "ЕE", К: "КK", М: "МM", Н: "НH", О: "ОO", Р: "РP", С: "СC", Т: "ТT", Х: "ХX",
};

export function markerPattern(name: string): RegExp {
  const letters = [...name].map((letter) => (LOOKALIKES[letter] ? `[${LOOKALIKES[letter]}]` : letter)).join("");
  return new RegExp(`^[\\s*#]*=+\\s*${letters}\\s*=+[\\s*]*$`, "im");
}

function section(text: string, marker: string, next?: string): string {
  const start = text.search(markerPattern(marker));
  if (start < 0) return "";
  const rest = text.slice(start).replace(/^[^\n]*\n/, "");
  if (!next) return rest;
  const end = rest.search(markerPattern(next));
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
    "/ustanovka/",
    ...getCategories().map(categoryUrl),
    ...getProducts().map((product) => `/product/${product.slug}/`),
    ...getPublishedArticles().map(articleUrl),
  ]);
}

function withSlash(href: string): string {
  const path = href.split(/[?#]/)[0];
  return path.endsWith("/") ? path : `${path}/`;
}

export function sanitizeArticleBody(body: string, title: string, allowed?: Set<string>): string {
  const known = knownPaths();
  const productSlugs = allowed?.size ? allowed : new Set(getProducts().map((product) => product.slug));
  const carded = new Set<string>();
  const photographed = new Set<string>();

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
    .replace(/^[\s*#]*=+[^=\n]*=+[\s*]*$/gm, "")
    .split("\n")
    .filter((line) => {
      const heading = line.match(/^#\s+(.+)$/);
      return !heading || !sameText(heading[1], title);
    })
    .map((line) => line.replace(/^#\s+/, "## "))
    .map((line) => {
      const product = line.trim().match(/^\{\{\s*товар\s*:\s*([a-z0-9-]+)\s*\}\}$/i);
      if (product) {
        const slug = product[1].toLowerCase();
        if (!productSlugs.has(slug) || carded.has(slug)) return "";
        carded.add(slug);
        return `{{товар:${slug}}}`;
      }
      const photo = line.trim().match(/^\{\{\s*фото\s+товара\s*:\s*([a-z0-9-]+)\s*\}\}$/i);
      if (photo) {
        const slug = photo[1].toLowerCase();
        if (!productSlugs.has(slug) || photographed.has(slug)) return "";
        photographed.add(slug);
        return `{{фото товара:${slug}}}`;
      }
      if (/^!\[|^\[\[/.test(line.trim())) return line;
      return fixLinks(line);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseGeneratedArticle(text: string, request: ArticleRequest): GeneratedArticle {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const bodyStart = cleaned.search(markerPattern("ТЕКСТ"));
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
    body: tidyProductBlocks(
      sanitizeArticleBody(rawBody, title, new Set(requestedProducts(request).map((product) => product.slug))),
    ),
    faq,
  };
}

const CARD_BLOCK = /^\{\{товар:([a-z0-9-]+)\}\}$/;
const LINK_ONLY_BLOCK = /^\[[^\]]+\]\(\/product\/([a-z0-9-]+)\/\)\.?$/;

export function tidyProductBlocks(body: string): string {
  const blocks = body.split(/\n{2,}/);
  return blocks
    .filter((block, index) => {
      const link = block.trim().match(LINK_ONLY_BLOCK);
      if (!link) return true;
      const next = blocks[index + 1]?.trim().match(CARD_BLOCK);
      return next?.[1] !== link[1];
    })
    .join("\n\n");
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
