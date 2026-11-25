import catalog from "../../data/kufar-models.json";

interface KufarGeneration {
  name: string;
  yearFrom: number | null;
  yearTo: number | null;
  tag: string;
}

interface KufarModelEntry {
  tag: string;
  generations: KufarGeneration[];
}

interface KufarMarkEntry {
  tag: string;
  models: Record<string, KufarModelEntry>;
}

export interface KufarCar {
  brand: string;
  model: string | null;
  modelName: string | null;
  generation: string | null;
}

const marks = catalog.marks as Record<string, KufarMarkEntry>;

const LOOKALIKES: Record<string, string> = { а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", х: "x" };
const SERIES_WORD = /(\s+серии|-класс)(?=\s|$)/gi;
const POWERTRAIN_SUFFIX = /(\s+(plug-in|hybrid|phev|ev|e\+|dm-?i))+$/i;
const RESTYLING = /(?:(\d)-й\s+)?рестайлинг(?:\s+(\d))?/i;

function key(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[авекмнорстх]/g, (letter) => LOOKALIKES[letter])
    .replace(/[^a-z0-9а-я]/g, "");
}

function withoutBrackets(text: string): string {
  return text.replace(/\s*\(.*?\)\s*/g, " ").trim();
}

const markByKey = new Map<string, KufarMarkEntry>();
for (const [name, mark] of Object.entries(marks)) {
  for (const variant of [name, withoutBrackets(name)]) {
    if (!markByKey.has(key(variant))) markByKey.set(key(variant), mark);
  }
}

function kufarMark(name: string): KufarMarkEntry | null {
  const variants = [name, withoutBrackets(name), name.match(/\((.*?)\)/)?.[1] ?? "", name.split(/\s*&\s*/)[0]];
  for (const variant of variants) {
    const found = variant && markByKey.get(key(variant));
    if (found) return found;
  }
  return null;
}

function kufarModel(mark: KufarMarkEntry, name: string): [string, KufarModelEntry] | null {
  const byKey = new Map<string, [string, KufarModelEntry]>();
  for (const entry of Object.entries(mark.models)) {
    for (const variant of [entry[0], withoutBrackets(entry[0]), entry[0].replace(SERIES_WORD, "")]) {
      if (!byKey.has(key(variant))) byKey.set(key(variant), entry);
    }
  }
  const plain = withoutBrackets(name.replace(SERIES_WORD, ""));
  for (const variant of [name, plain, plain.replace(POWERTRAIN_SUFFIX, "")]) {
    const found = byKey.get(key(variant));
    if (found) return found;
  }
  return null;
}

function restylingOf(name: string): number {
  const match = name.match(RESTYLING);
  if (!match) return 0;
  return Number(match[1] ?? match[2] ?? 1);
}

function generationKey(name: string): string {
  const restyling = restylingOf(name);
  return `${key(name.replace(RESTYLING, ""))}|${restyling}`;
}

function kufarGeneration(
  model: KufarModelEntry,
  name: string,
  yearFrom: number | null,
): string | null {
  const exact = model.generations.find((generation) => key(generation.name) === key(name));
  if (exact) return exact.tag;
  const normalized = model.generations.find((generation) => generationKey(generation.name) === generationKey(name));
  if (normalized) return normalized.tag;
  if (!yearFrom) return null;
  const restyling = restylingOf(name);
  const sameStart = model.generations.filter(
    (generation) =>
      generation.yearFrom !== null &&
      Math.abs(generation.yearFrom - yearFrom) <= 1 &&
      restylingOf(generation.name) === restyling,
  );
  return sameStart.length === 1 ? sameStart[0].tag : null;
}

export function kufarCar(
  markName: string,
  modelName: string,
  generationName: string,
  yearFrom: number | null,
): KufarCar | null {
  const mark = kufarMark(markName);
  if (!mark) return null;
  const model = kufarModel(mark, modelName);
  if (!model) return { brand: mark.tag, model: null, modelName: null, generation: null };
  return {
    brand: mark.tag,
    model: model[1].tag,
    modelName: model[0],
    generation: kufarGeneration(model[1], generationName, yearFrom),
  };
}
