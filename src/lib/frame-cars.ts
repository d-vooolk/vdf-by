import { getDb } from "./db";

export interface ParsedCar {
  head: string;
  label: string;
  yearFrom: number | null;
  yearTo: number | null;
}

export interface CarMatch {
  source: string;
  generationIds: string[];
  names: string[];
  approximate: boolean;
}

interface GenerationRow {
  id: string;
  name: string;
  yearFrom: number | null;
  yearTo: number | null;
}

interface ModelRow {
  id: string;
  name: string;
  generations: GenerationRow[];
}

interface MarkRow {
  id: string;
  name: string;
  models: ModelRow[];
}

const RESTYLE = /рестайлинг/i;
const MARK_ALIASES: Array<[RegExp, string]> = [
  [/^mercedes (?!benz)/, "mercedes benz "],
  [/^vw /, "volkswagen "],
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/серия/g, "серии")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(label: string): Set<string> {
  return new Set(
    normalize(label.replace(RESTYLE, " "))
      .split(" ")
      .filter((token) => token && !/^\d{4}$/.test(token)),
  );
}

export function parseVdfCar(source: string): ParsedCar | null {
  const outer = source.trim().match(/^(.*?)\s*\((.*)\)\s*$/);
  if (!outer) return null;
  const inner = outer[2].trim();
  const years = inner.match(/\((\d{4})\s*[—–-]\s*(\d{4})?\s*\)\s*$/);
  const label = (years ? inner.slice(0, years.index) : inner).trim();
  return {
    head: outer[1].trim(),
    label,
    yearFrom: years ? Number(years[1]) : null,
    yearTo: years?.[2] ? Number(years[2]) : null,
  };
}

function loadCatalog(): MarkRow[] {
  const db = getDb();
  const marks = db.prepare("SELECT id, name FROM car_marks").all() as Array<{ id: string; name: string }>;
  const models = db.prepare("SELECT id, mark_id AS markId, name FROM car_models").all() as Array<{
    id: string;
    markId: string;
    name: string;
  }>;
  const generations = db
    .prepare(
      `SELECT id, model_id AS modelId, name, year_from AS yearFrom, year_to AS yearTo
         FROM car_generations`,
    )
    .all() as Array<GenerationRow & { modelId: string }>;

  const byModel = new Map<string, GenerationRow[]>();
  for (const generation of generations) {
    const list = byModel.get(generation.modelId) ?? [];
    list.push(generation);
    byModel.set(generation.modelId, list);
  }
  const byMark = new Map<string, ModelRow[]>();
  for (const model of models) {
    const list = byMark.get(model.markId) ?? [];
    list.push({ id: model.id, name: model.name, generations: byModel.get(model.id) ?? [] });
    byMark.set(model.markId, list);
  }
  return marks.map((mark) => ({ ...mark, models: byMark.get(mark.id) ?? [] }));
}

function startsWithWords(text: string, prefix: string): boolean {
  return text === prefix || text.startsWith(`${prefix} `);
}

function longestPrefix<T extends { name: string }>(items: T[], text: string): T | undefined {
  let best: T | undefined;
  let bestLength = -1;
  for (const item of items) {
    const name = normalize(item.name);
    if (name && startsWithWords(text, name) && name.length > bestLength) {
      best = item;
      bestLength = name.length;
    }
  }
  return best;
}

function overlapYears(car: ParsedCar, generation: GenerationRow): number {
  if (car.yearFrom === null || generation.yearFrom === null) return 0;
  const carTo = car.yearTo ?? car.yearFrom;
  const generationTo = generation.yearTo ?? new Date().getFullYear();
  const from = Math.max(car.yearFrom, generation.yearFrom);
  const to = Math.min(carTo, generationTo);
  if (to < from) return -1;
  if (to === from && (carTo === car.yearFrom || generationTo === generation.yearFrom)) return 1;
  return to - from;
}

function pickGenerations(car: ParsedCar, model: ModelRow): GenerationRow[] {
  let candidates = model.generations.filter((generation) => overlapYears(car, generation) >= 1);
  if (!candidates.length) return [];

  const wanted = tokens(car.label);
  if (wanted.size) {
    const sharing = candidates.filter((generation) =>
      [...tokens(generation.name)].some((token) => wanted.has(token)),
    );
    if (sharing.length) candidates = sharing;
  }

  const restyled = RESTYLE.test(car.label);
  const sameKind = candidates.filter((generation) => RESTYLE.test(generation.name) === restyled);
  if (sameKind.length) candidates = sameKind;

  return candidates;
}

export function matchVdfCars(sources: string[], catalog: MarkRow[] = loadCatalog()): CarMatch[] {
  return sources.map((source) => {
    const car = parseVdfCar(source);
    if (!car) return { source, generationIds: [], names: [], approximate: false };
    const head = MARK_ALIASES.reduce(
      (text, [pattern, replacement]) => text.replace(pattern, replacement),
      normalize(car.head),
    );
    const mark = longestPrefix(catalog, head);
    if (!mark) return { source, generationIds: [], names: [], approximate: false };
    const rest = head.slice(normalize(mark.name).length).trim();
    const model = longestPrefix(mark.models, rest);
    if (!model) return { source, generationIds: [], names: [], approximate: false };
    const generations = pickGenerations(car, model);
    return {
      source,
      approximate: normalize(model.name) !== rest,
      generationIds: generations.map((generation) => generation.id),
      names: generations.map(
        (generation) =>
          `${mark.name} ${model.name} ${generation.name} ${generation.yearFrom ?? ""}–${generation.yearTo ?? ""}`,
      ),
    };
  });
}

export function carCatalog(): MarkRow[] {
  return loadCatalog();
}
