import { AiError, complete } from "./ai";
import type { DonorPage } from "./donor-page";

const MAX_SPECS = 40;
const SKIPPED_SPEC = /артикул|код товара|^код$|цена|стоимость|наличи|остат|доступно/i;

const EXTRACT_PROMPT = `Ты разбираешь страницу товара интернет-магазина. Тебе дают заголовок товара и пронумерованные строки видимого текста страницы.

Найди:
1. Описание товара — связный текст о самом товаре: что это, зачем нужно, преимущества, совместимость, комплектация, производство, гарантия. К описанию НЕ относятся: меню, хлебные крошки, заголовок, таблица характеристик, цена, наличие, кнопки, доставка и оплата, отзывы, похожие товары, контакты, подвал сайта. Укажи номера строк описания диапазонами.
2. Характеристики — пары «название — значение» из таблицы или списка характеристик товара, слово в слово как на странице. Не включай артикул, код товара, цену, наличие и остаток.

Ничего не придумывай и не переписывай. Если чего-то нет — верни пустой массив.

Верни только JSON без пояснений и без Markdown:
{"description": [[первая_строка, последняя_строка]], "specs": [{"name": "…", "value": "…"}]}`;

export interface DonorContent {
  description: string;
  specs: Array<{ name: string; value: string }>;
}

interface ExtractAnswer {
  description?: unknown;
  specs?: unknown;
}

function parseAnswer(text: string): ExtractAnswer {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new AiError("Нейросеть не разобрала страницу — попробуйте ещё раз");
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as ExtractAnswer;
  } catch {
    throw new AiError("Нейросеть не разобрала страницу — попробуйте ещё раз");
  }
}

function descriptionFromRanges(ranges: unknown, lines: string[]): string {
  if (!Array.isArray(ranges)) return "";
  const picked = new Set<number>();
  for (const range of ranges) {
    const [from, to] = Array.isArray(range) ? range.map(Number) : [Number(range), Number(range)];
    if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
    const first = Math.max(1, Math.min(from, to));
    const last = Math.min(lines.length, Math.max(from, to));
    for (let index = first; index <= last; index += 1) picked.add(index);
  }
  return [...picked]
    .sort((a, b) => a - b)
    .map((index) => lines[index - 1])
    .join("\n");
}

function cleanSpecs(specs: unknown): DonorContent["specs"] {
  if (!Array.isArray(specs)) return [];
  const seen = new Set<string>();
  const result: DonorContent["specs"] = [];
  for (const item of specs) {
    const name = String((item as { name?: unknown })?.name ?? "").trim();
    const value = String((item as { value?: unknown })?.value ?? "").trim();
    if (!name || !value || SKIPPED_SPEC.test(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    result.push({ name: name.slice(0, 120), value: value.slice(0, 300) });
    if (result.length >= MAX_SPECS) break;
  }
  return result;
}

export async function extractDonorContent(page: DonorPage): Promise<DonorContent> {
  const request = [
    `Заголовок товара: ${page.title}`,
    page.structuredDescription
      ? `Начало описания из разметки страницы: ${page.structuredDescription.slice(0, 600)}`
      : "",
    "",
    "Строки страницы:",
    page.lines.map((line, index) => `${index + 1}| ${line}`).join("\n"),
  ].join("\n");

  const answer = parseAnswer(await complete(EXTRACT_PROMPT, request, "import"));
  const description =
    descriptionFromRanges(answer.description, page.lines) || page.structuredDescription;
  return { description: description.trim(), specs: cleanSpecs(answer.specs) };
}

export const WRITE_FROM_TITLE = `

Исходного описания нет. Напиши описание товара с нуля по названию, разделу, бренду и характеристикам. Опирайся только на эти данные и общеизвестные свойства такого типа товаров: не придумывай цифр, совместимости, комплектации и гарантии, которых нет в данных. Требования к стилю, объёму и формату — те же.`;
