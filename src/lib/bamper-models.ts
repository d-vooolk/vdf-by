import catalog from "../../data/bamper-models.json";

export interface BamperModel {
  mark: string;
  model: string;
}

const MARK_ALIASES: Record<string, string> = {
  mercedesbenz: "Mercedes",
  тагаз: "Tagaz",
  kgm: "SsangYong",
  gactrumpchi: "GAC",
  renaultsamsung: "Samsung",
};

const MODEL_ALIASES: Record<string, Record<string, string>> = {
  Lada: { "1111 Ока": "Ока" },
  "Land Rover": { "Range Rover Evoque": "Evoque" },
};

const SERIES_WORD = /(\s+серии|-класс)(?=\s|$)/gi;

function key(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/[^a-z0-9а-я]/g, "");
}

function codes(text: string): string[] {
  return text
    .split(/[\s/,()]+/)
    .map(key)
    .filter((token) => /\d/.test(token) && /[a-zа-я]/.test(token));
}

const marksByKey = new Map<string, string>(
  Object.keys(catalog.marks).map((mark) => [key(mark), mark]),
);

function bamperMark(name: string): string | null {
  const variants = [name, name.replace(/\s*\(.*?\)\s*/g, " "), name.match(/\((.*?)\)/)?.[1] ?? ""];
  for (const variant of variants) {
    const found = MARK_ALIASES[key(variant)] ?? marksByKey.get(key(variant));
    if (found) return found;
  }
  return null;
}

interface Variant {
  model: string;
  rest: string;
}

interface VariantScore {
  model: string;
  hits: number;
  extraWords: number;
  firstCode: number;
}

function variantsOf(models: string[], wanted: string): Variant[] {
  return models.flatMap((model) => {
    const words = model.split(/\s+/);
    for (let length = 1; length < words.length; length++) {
      if (key(words.slice(0, length).join(" ")) === wanted) {
        return [{ model, rest: words.slice(length).join(" ") }];
      }
    }
    return [];
  });
}

function sameBody(pattern: string, code: string): boolean {
  if (pattern === code) return true;
  return /\dx$/.test(pattern) && pattern.length === code.length && code.startsWith(pattern.slice(0, -1));
}

function better(a: VariantScore, b: VariantScore | null): boolean {
  if (!b) return true;
  if (a.hits !== b.hits) return a.hits > b.hits;
  if (a.extraWords !== b.extraWords) return a.extraWords < b.extraWords;
  return a.firstCode < b.firstCode;
}

function bodyVariant(variants: Variant[], generation: string): string | null {
  const wanted = codes(generation);
  let best: VariantScore | null = null;
  for (const { model, rest } of variants) {
    const own = codes(rest);
    const positions = own
      .map((code) => wanted.findIndex((pattern) => sameBody(pattern, code)))
      .filter((position) => position >= 0);
    if (!positions.length) continue;
    const extraWords = rest.split(/\s+/).filter((word) => !own.includes(key(word))).length;
    const score = { model, hits: positions.length, extraWords, firstCode: Math.min(...positions) };
    if (better(score, best)) best = score;
  }
  return best?.model ?? null;
}

function matchModel(models: string[], name: string, generation: string): string | null {
  const words = name.replace(SERIES_WORD, "").trim().split(/\s+/);
  for (let length = words.length; length > 0; length--) {
    const wanted = key(words.slice(0, length).join(" "));
    const exact = models.find((model) => key(model) === wanted);
    const variants = variantsOf(models, wanted);
    const variant = bodyVariant(variants, generation);
    if (variant) return variant;
    if (exact) return exact;
    if (length === words.length && variants.length === 1) return variants[0].model;
  }
  return null;
}

export function bamperModel(markName: string, modelName: string, generationName: string): BamperModel | null {
  const mark = bamperMark(markName);
  if (!mark) return null;
  const models = (catalog.marks as Record<string, string[]>)[mark];
  const alias = MODEL_ALIASES[mark]?.[modelName];
  if (alias) return { mark, model: alias };
  const model = matchModel(models, modelName, generationName);
  return model ? { mark, model } : null;
}
