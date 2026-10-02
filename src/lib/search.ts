/**
 * Поиск по каталогу.
 *
 * Индекс собирается на сборке в public/search-index.json и подгружается
 * лениво — только когда пользователь дотронулся до поля поиска. На главной
 * и в каталоге его вес не влияет ни на что.
 *
 * Ключи в индексе однобуквенные: при 300+ товарах разница между "title" и
 * "t" в каждой записи — это десятки килобайт.
 */

export interface SearchEntry {
  /** slug товара */
  s: string;
  /** title */
  t: string;
  /** brand */
  b?: string;
  /** название категории */
  c: string;
  /** минимальная цена */
  p: number;
  /** есть ли варианты в наличии */
  a: 0 | 1;
  /** URL миниатюры */
  i?: string;
  k?: string;
  /** нормализованная строка, по которой ищем */
  q: string;
}

/** Раскладка: «р7» набрано в русской раскладке вместо «h7». */
const LAYOUT: Record<string, string> = {
  й: "q", ц: "w", у: "e", к: "r", е: "t", н: "y", г: "u", ш: "i", щ: "o",
  з: "p", х: "[", ъ: "]", ф: "a", ы: "s", в: "d", а: "f", п: "g", р: "h",
  о: "j", л: "k", д: "l", ж: ";", э: "'", я: "z", ч: "x", с: "c", м: "v",
  и: "b", т: "n", ь: "m", б: ",", ю: ".",
};

const LOOKALIKE: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c",
  т: "t", у: "y", х: "x", і: "i",
};

const CODE_SEPARATORS = /[\s\-_./\\]+/g;

export function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function compactCode(text: string): string {
  return normalize(text).replace(CODE_SEPARATORS, "");
}

export function codeForms(code: string): string[] {
  const spelled = normalize(code).replace(/\s+/g, "-");
  const compact = compactCode(code);
  return compact === spelled ? [compact] : [spelled, compact];
}

function codeSegments(code: string): string[] {
  return code.split(CODE_SEPARATORS).filter(Boolean);
}

const MIN_CODE_LENGTH = 3;

function hasToken(entry: SearchEntry, token: string): boolean {
  if (entry.q.includes(token)) return true;
  const code = compactCode(token);
  return code.length >= MIN_CODE_LENGTH && code !== token && Boolean(entry.k?.includes(code));
}

function codeScore(entry: SearchEntry, variant: string): number {
  const code = compactCode(variant);
  if (!entry.k || code.length < MIN_CODE_LENGTH) return 0;
  const codes = entry.k.split(" ");
  if (codes.includes(code)) return 300;
  if (codes.some((item) => codeSegments(item).includes(code))) return 250;
  if (codes.some((item) => item.startsWith(code) || codeSegments(item).some((part) => part.startsWith(code)))) {
    return 150;
  }
  return entry.k.includes(code) ? 20 : 0;
}

/** Тот же текст, но как если бы его набрали в латинской раскладке. */
function asLatinLayout(text: string, table: Record<string, string> = LAYOUT): string {
  let converted = "";
  let changed = false;
  for (const char of text) {
    const mapped = table[char];
    if (mapped) {
      converted += mapped;
      changed = true;
    } else {
      converted += char;
    }
  }
  return changed ? converted : "";
}

/**
 * Все токены запроса должны найтись в записи (логическое И). Для каталога
 * автосвета это лучше нечёткого поиска: «линза 3 дюйма» должно сузить
 * выборку, а не расширить её до всех линз.
 */
export function searchProducts(
  index: SearchEntry[],
  query: string,
  limit = 8,
): SearchEntry[] {
  const normalized = normalize(query);
  if (normalized.length < 2) return [];

  const variants = [normalized];
  const latin = asLatinLayout(normalized);
  if (latin) variants.push(latin);
  const lookalike = asLatinLayout(normalized, LOOKALIKE);
  if (lookalike && lookalike !== latin) variants.push(lookalike);

  const matches: Array<{ entry: SearchEntry; score: number }> = [];

  for (const entry of index) {
    let best = -1;

    for (const variant of variants) {
      const tokens = variant.split(" ").filter(Boolean);
      const byCode = codeScore(entry, variant);
      if (!byCode && !tokens.every((token) => hasToken(entry, token))) continue;

      // Совпадение в начале названия ценнее совпадения где-то в описании,
      // а товар в наличии — ценнее отсутствующего.
      let score = byCode;
      const title = normalize(entry.t);
      if (title.startsWith(variant)) score += 100;
      else if (title.includes(variant)) score += 50;
      if (entry.a) score += 10;
      best = Math.max(best, score);
    }

    if (best >= 0) matches.push({ entry, score: best });
  }

  return matches
    .sort((a, b) => b.score - a.score || a.entry.p - b.entry.p)
    .slice(0, limit)
    .map((match) => match.entry);
}
