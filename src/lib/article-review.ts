import { cleanPlainText } from "./ai";
import {
  describeArticleRequest,
  markerPattern,
  parseGeneratedArticle,
  type ArticleRequest,
  type GeneratedArticle,
} from "./article-ai";
import {
  articleImagePaths,
  articlePlaceholders,
  articlePlainText,
  articleProductSlugs,
  parseArticleBody,
} from "./article-body";
import type { ArticleData } from "./articles";
import { env, envNumber } from "./env.mjs";
import type { Product } from "./schema";

export type ArticleReview = NonNullable<ArticleData["seoReview"]>;

export function articleAiOptions() {
  const models = env("AI_ARTICLE_MODEL", "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return {
    timeout: envNumber("AI_ARTICLE_TIMEOUT_MS", 420000),
    maxTokens: envNumber("AI_ARTICLE_MAX_TOKENS", 24000),
    ...(models.length ? { models } : {}),
  };
}

export function articleChecks(article: GeneratedArticle, keyword?: string): string[] {
  const plain = articlePlainText(article.body);
  const blocks = parseArticleBody(article.body);
  const problems: string[] = [];
  const count = (type: string) => blocks.filter((block) => block.type === type).length;
  const seoTitle = article.seoTitle ?? article.title;
  const description = article.seoDescription ?? "";

  if (plain.length < 7000) problems.push(`Текст ${plain.length} знаков — меньше 7000, раскрыть тему глубже`);
  if (count("h2") < 4) problems.push(`Разделов ## всего ${count("h2")} — нужно 4–8`);
  if (!count("table")) problems.push("Нет ни одной таблицы сравнения");
  if (!count("ul") && !count("ol")) problems.push("Нет ни одного списка");
  if (seoTitle.length > 65) problems.push(`SEO_ЗАГОЛОВОК ${seoTitle.length} знаков — сократить до 60`);
  if (description.length < 130 || description.length > 170) {
    problems.push(`SEO_ОПИСАНИЕ ${description.length} знаков — нужно 140–160`);
  }
  if (!article.excerpt) problems.push("Нет АННОТАЦИИ");
  if (article.faq.length < 4) problems.push(`Вопросов в блоке ВОПРОСЫ ${article.faq.length} — нужно 4–6`);
  if (articleProductSlugs(article.body).length < 3) {
    problems.push("Мало ссылок и карточек товаров магазина — нужно от 3");
  }
  if (articlePlaceholders(article.body).length + articleImagePaths(article.body).length < 2) {
    problems.push("Меньше двух мест под фото [[фото: …]]");
  }
  const phrase = keyword?.trim().toLowerCase();
  if (phrase) {
    const lead = `${article.title} ${article.excerpt ?? ""} ${plain.slice(0, 800)}`.toLowerCase();
    if (!lead.includes(phrase)) {
      problems.push(`Главный запрос «${keyword}» не встречается в заголовке и начале текста`);
    }
  }
  return problems;
}

export function formatArticle(article: GeneratedArticle): string {
  return [
    `ЗАГОЛОВОК: ${article.title}`,
    `SEO_ЗАГОЛОВОК: ${article.seoTitle ?? ""}`,
    `SEO_ОПИСАНИЕ: ${article.seoDescription ?? ""}`,
    `АННОТАЦИЯ: ${article.excerpt ?? ""}`,
    "===ТЕКСТ===",
    article.body,
    "===ВОПРОСЫ===",
    JSON.stringify(article.faq),
  ].join("\n");
}

export const ARTICLE_REVIEW_PROMPT = `Ты — строгий SEO-редактор и эксперт по автомобильному свету. Тебе дают черновик статьи для блога интернет-магазина автосвета в Беларуси. Оцени, насколько статья готова занять первые места в Яндексе и Google и попадать в ответы нейросетей, и выдай исправленную версию.

Оцени по шкале 0–100 с учётом:
- полноты и пользы: ответ на главный вопрос сразу, конкретика, сравнения, инструкции, типичные ошибки, всё, что человек захочет узнать по теме;
- точности: ничего выдуманного, нет противоречий, цены только из списка товаров;
- структуры: заголовки в форме поисковых вопросов, каждый раздел начинается с прямого ответа, есть таблица и списки, логичный порядок;
- SEO: главный запрос и синонимы в заголовке, аннотации, первых абзацах и подзаголовках без переспама; SEO_ЗАГОЛОВОК до 60 знаков; SEO_ОПИСАНИЕ 140–160 знаков с выгодой для читателя;
- перелинковки: 3 и больше уместных ссылок на товары и разделы магазина из списков, 2–6 карточек {{товар:…}};
- языка: живой экспертный русский, без воды, канцелярита, штампов и повторов;
- блока вопросов: 4–6 реальных вопросов, не дублирующих заголовки.

Исправь все найденные недостатки: допиши недостающие разделы, усиль ответы, поправь заголовки, SEO-поля, перелинковку и вопросы. Не сокращай хорошие части и не делай текст короче без причины.
Строки, которые начинаются с ![, {{товар: и [[фото:, сохраняй дословно — это уже поставленные фото и карточки. Новые места под фото можно добавить строкой [[фото: описание]]. Адреса бери только из списков ниже, на внешние сайты не ссылайся.

Ответ верни строго в таком виде:
ОЦЕНКА: число от 0 до 100 — оценка черновика до правок
ЗАМЕЧАНИЯ:
- что было не так и что исправлено, 3–10 пунктов, коротко
===СТАТЬЯ===
исправленная статья целиком в исходном формате: ЗАГОЛОВОК, SEO_ЗАГОЛОВОК, SEO_ОПИСАНИЕ, АННОТАЦИЯ, ===ТЕКСТ===, ===ВОПРОСЫ===`;

export function describeReview(
  article: GeneratedArticle,
  request: ArticleRequest,
  candidates: Product[],
): string {
  const checks = articleChecks(article, request.keyword);
  return [
    describeArticleRequest(request, candidates),
    "",
    checks.length
      ? ["Автоматическая проверка нашла:", ...checks.map((check) => `- ${check}`)].join("\n")
      : "Автоматическая проверка формальных требований замечаний не нашла.",
    "",
    "Черновик статьи:",
    formatArticle(article),
  ].join("\n");
}

function parseNotes(head: string): string[] {
  const part = head.split(/ЗАМЕЧАНИЯ\**\s*:/i)[1] ?? "";
  return part
    .split("\n")
    .map((line) => cleanPlainText(line.replace(/^\s*(?:[-*•—]|\d+[.)])\s*/, "")))
    .filter((line) => line.length > 3)
    .slice(0, 12)
    .map((line) => line.slice(0, 600));
}

export function parseReview(
  text: string,
  draft: GeneratedArticle,
  request: ArticleRequest,
): { article: GeneratedArticle; review: ArticleReview } {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const marker = cleaned.search(markerPattern("СТАТЬЯ"));
  const head = marker < 0 ? cleaned.slice(0, 3000) : cleaned.slice(0, marker);
  const scoreMatch = head.match(/ОЦЕНКА\**\s*:\s*\**\s*(\d{1,3})/i);
  const score = Math.max(0, Math.min(100, Number(scoreMatch?.[1] ?? 0)));
  const notes = parseNotes(head);
  const base = { score, notes, at: Date.now() };

  if (marker < 0) return { article: draft, review: { ...base, revised: false } };

  const revisedText = cleaned.slice(marker).replace(/^[^\n]*\n/, "");
  if (/^\s*без изменений\s*$/i.test(revisedText)) {
    return { article: draft, review: { ...base, revised: false } };
  }

  const revised = parseGeneratedArticle(revisedText, request);
  const draftLength = articlePlainText(draft.body).length;
  const revisedLength = articlePlainText(revised.body).length;
  const keptImages = articleImagePaths(draft.body).every((path) => revised.body.includes(path));
  const keptCards = articleProductSlugs(draft.body).every((slug) => revised.body.includes(slug));

  if (revisedLength < draftLength * 0.8 || !keptImages) {
    return {
      article: draft,
      review: {
        ...base,
        revised: false,
        notes: [...notes, "Исправленная версия потеряла часть текста или фото — оставлен исходный вариант"],
      },
    };
  }

  return {
    article: {
      ...revised,
      faq: revised.faq.length >= Math.min(draft.faq.length, 3) ? revised.faq : draft.faq,
      seoTitle: revised.seoTitle ?? draft.seoTitle,
      seoDescription: revised.seoDescription ?? draft.seoDescription,
      excerpt: revised.excerpt ?? draft.excerpt,
    },
    review: {
      ...base,
      revised: true,
      notes: keptCards
        ? notes
        : [...notes, "Часть карточек товаров из черновика исправленная версия убрала — проверьте"],
    },
  };
}
