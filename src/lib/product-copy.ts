import {
  AiError,
  cleanPlainText,
  complete,
  describeProduct,
  finishRewrite,
  promptFor,
  type AiProductInput,
} from "./ai";
import { WRITE_FROM_TITLE } from "./ai-import";
import { getDb } from "./db";

export const COPY_TARGET_SCORE = 85;
export const COPY_MAX_REVIEWS = 3;
export const COPY_STANDARD = "2026-10";

const LIMITS = {
  product: { min: 1000, max: 3500 },
  category: { min: 2000, max: 6000 },
} as const;

const LEAD_LIMIT = 160;

export const COPY_REVIEW_PROMPT = `Ты — строгий SEO-редактор интернет-магазина автомобильного света в Беларуси (Минск, доставка по стране). Тебе дают данные товара или раздела каталога и черновик описания для его страницы. Оцени черновик и выдай исправленную версию.

Оцени по шкале 0–100 с учётом:
- точности: все факты, цифры и характеристики из данных сохранены, ничего не выдумано — ни совместимость, ни гарантия, ни комплектация, ни цены;
- пользы: из текста понятно, что это, для чего, чем лучше альтернатив, для каких задач и машин подходит (только по данным), на что смотреть при выборе и установке;
- SEO: главный запрос из названия в первом предложении и ещё 1–2 раза по тексту, плюс синонимы и формулировки, которыми ищут такой товар; без переспама и повторов;
- первого абзаца: 1–2 предложения до 160 знаков, сразу о главном — он уходит в сниппет поисковой выдачи;
- структуры: 3–6 коротких абзацев, у каждого своя мысль;
- языка: живой экспертный русский, без воды, канцелярита, штампов («широкий ассортимент», «высокое качество») и восклицательных знаков;
- формата: обычный текст, абзацы через пустую строку, без Markdown, заголовков, звёздочек и эмодзи; не упоминать другие магазины и сайты.

Исправь все найденные недостатки. Не сокращай хорошие части и не выкидывай факты.

Ответ верни строго в таком виде:
ОЦЕНКА: число от 0 до 100 — оценка черновика до правок
ЗАМЕЧАНИЯ:
- что было не так и что исправлено, 2–8 пунктов, коротко
===ТЕКСТ===
исправленное описание целиком`;

export function copyChecks(text: string, kind: "product" | "category" = "product"): string[] {
  const limits = LIMITS[kind];
  const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const problems: string[] = [];
  if (text.length < limits.min) {
    problems.push(`Текст ${text.length} знаков — меньше ${limits.min}, раскрыть пользу и применение`);
  }
  if (text.length > limits.max) problems.push(`Текст ${text.length} знаков — больше ${limits.max}, убрать воду`);
  if ((paragraphs[0]?.length ?? 0) > LEAD_LIMIT) {
    problems.push(`Первый абзац ${paragraphs[0].length} знаков — сократить до ${LEAD_LIMIT}`);
  }
  if (paragraphs.length < 3) problems.push(`Абзацев ${paragraphs.length} — нужно 3–6`);
  if (/[#*|]|^\s*-\s/m.test(text)) problems.push("Есть Markdown-разметка — нужен обычный текст");
  if (text.includes("!")) problems.push("Есть восклицательные знаки");
  return problems;
}

export interface CopyReview {
  score: number;
  notes: string[];
  text: string | null;
}

export function parseCopyReview(answer: string): CopyReview {
  const marker = answer.search(/={2,}\s*ТЕКСТ\s*={2,}/i);
  const head = marker < 0 ? answer.slice(0, 3000) : answer.slice(0, marker);
  const score = Math.max(0, Math.min(100, Number(head.match(/ОЦЕНКА\**\s*:\s*\**\s*(\d{1,3})/i)?.[1] ?? 0)));
  const notes = (head.split(/ЗАМЕЧАНИЯ\**\s*:/i)[1] ?? "")
    .split("\n")
    .map((line) => cleanPlainText(line.replace(/^\s*(?:[-*•—]|\d+[.)])\s*/, "")))
    .filter((line) => line.length > 3)
    .slice(0, 10);
  const text = marker < 0 ? null : finishRewrite(answer.slice(marker).replace(/^[^\n]*\n/, ""));
  return { score, notes, text: text && text.length > 200 ? text : null };
}

export interface CopyResult {
  text: string;
  score: number;
  reviews: number;
  notes: string[];
}

export async function reviewCopy(
  input: AiProductInput,
  draft: string,
  onStep?: (step: { round: number; score: number }) => void,
): Promise<CopyResult> {
  const kind = input.kind ?? "product";
  let text = draft;
  let score = 0;
  let notes: string[] = [];
  let reviews = 0;

  for (let round = 1; round <= COPY_MAX_REVIEWS; round++) {
    const checks = copyChecks(text, kind);
    const answer = await complete(
      COPY_REVIEW_PROMPT,
      [
        describeProduct(input, false),
        "",
        checks.length
          ? ["Автоматическая проверка нашла:", ...checks.map((check) => `- ${check}`)].join("\n")
          : "Автоматическая проверка формальных требований замечаний не нашла.",
        "",
        "Черновик описания:",
        text,
      ].join("\n"),
      "rewrite",
    );
    const review = parseCopyReview(answer);
    reviews = round;
    score = review.score;
    notes = review.notes;
    onStep?.({ round, score });
    if (score >= COPY_TARGET_SCORE && checks.length === 0) break;
    if (!review.text || review.text.length < text.length * 0.7) break;
    text = review.text;
  }

  return { text, score, reviews, notes };
}

export async function writeProductCopy(input: AiProductInput): Promise<CopyResult> {
  const source = input.description.trim();
  const draft = finishRewrite(
    await complete(
      promptFor("rewrite", input.prompt) + (source ? "" : WRITE_FROM_TITLE),
      describeProduct(input, false),
      "rewrite",
    ),
  );
  if (!draft) throw new AiError("Нейросеть вернула пустой текст");
  return reviewCopy(input, draft);
}

export function recordCopy(productId: string, result: CopyResult): void {
  getDb()
    .prepare(
      `INSERT INTO product_copy (product_id, standard, score, reviews, notes, at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET
         standard = excluded.standard, score = excluded.score, reviews = excluded.reviews,
         notes = excluded.notes, at = excluded.at`,
    )
    .run(productId, COPY_STANDARD, result.score, result.reviews, JSON.stringify(result.notes), Date.now());
}

export interface CopyQueue {
  ids: string[];
  total: number;
  done: number;
}

export function copyQueue(skip: Set<string>): CopyQueue {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.id FROM products p
         LEFT JOIN product_copy c ON c.product_id = p.id AND c.standard = ?
        WHERE c.product_id IS NULL
        ORDER BY length(COALESCE(json_extract(p.data, '$.description'), '')), p.id`,
    )
    .all(COPY_STANDARD) as Array<{ id: string }>;
  const total = (db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number }).n;
  return {
    ids: rows.map((row) => row.id).filter((id) => !skip.has(id)),
    total,
    done: total - rows.length,
  };
}
