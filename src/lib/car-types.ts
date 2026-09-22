/**
 * Типы справочника автомобилей и чистые помощники к ним.
 *
 * Модуль намеренно без обращений к базе и файловой системе: его импортируют
 * и серверные страницы подбора, и клиентские — выбор машины на главной,
 * привязка машин в карточке товара. Всё, что умеет читать и писать, лежит
 * в cars.ts и в браузер не попадает.
 */

export interface CarMark {
  id: string;
  slug: string;
  name: string;
  /** Путь логотипа в манифесте картинок. Пусто — иконку ещё не забрали. */
  logo: string;
}

export interface CarModel {
  id: string;
  markId: string;
  slug: string;
  name: string;
  yearFrom: number | null;
  yearTo: number | null;
}

export interface CarGeneration {
  id: string;
  modelId: string;
  slug: string;
  name: string;
  yearFrom: number | null;
  yearTo: number | null;
  /** Путь фотографии в манифесте картинок. Пусто — ещё не забрали. */
  photo: string;
}

export type CarLevel = "mark" | "model" | "generation";

export interface CarEntry {
  id: string;
  slug: string;
  name: string;
  yearFrom: number | null;
  yearTo: number | null;
  manual: boolean;
  image: string;
  thumb: string;
  pendingImage: boolean;
}

export interface CarEntryInput {
  id?: string;
  parentId?: string;
  name: string;
  yearFrom: number | null;
  yearTo: number | null;
  image: string;
  imageUrl?: string;
}

export interface FitGeneration extends CarGeneration {
  productCount: number;
  updatedAt: number;
}

export interface FitModel extends CarModel {
  generations: FitGeneration[];
  productCount: number;
}

export interface FitMark extends CarMark {
  models: FitModel[];
  productCount: number;
}

/** Одна привязка товара к машине — с названиями, а не одними кодами. */
export interface ProductCar {
  markSlug: string;
  markName: string;
  modelSlug: string;
  modelName: string;
  generationId: string;
  generationSlug: string;
  generationName: string;
  yearFrom: number | null;
  yearTo: number | null;
}

/* ------------------------------------------------------------------ */
/* Адреса                                                              */
/* ------------------------------------------------------------------ */

export const CARS_ROOT = "/podbor/";

export function carsRoot(categorySlug?: string): string {
  return categorySlug ? `/catalog/${categorySlug}/` : CARS_ROOT;
}

export function markUrl(markSlug: string, base: string = CARS_ROOT): string {
  return `${base}${markSlug}/`;
}

export function modelUrl(
  markSlug: string,
  modelSlug: string,
  base: string = CARS_ROOT,
): string {
  return `${base}${markSlug}/${modelSlug}/`;
}

export function generationUrl(
  markSlug: string,
  modelSlug: string,
  generationSlug: string,
  base: string = CARS_ROOT,
): string {
  return `${base}${markSlug}/${modelSlug}/${generationSlug}/`;
}

/* ------------------------------------------------------------------ */
/* Подписи                                                             */
/* ------------------------------------------------------------------ */

/**
 * Годы выпуска человеческой строкой.
 *
 * Донор справочника ставит верхней границей текущий год всему, что ещё
 * выпускается. Писать «2019–2026» про машину, которую продают прямо
 * сейчас, значит врать на несколько лет вперёд, поэтому такие поколения
 * подписываются открытым интервалом.
 *
 * Год берётся аргументом, а не из Date.now() внутри: страницы подбора
 * собираются заранее и лежат в кеше, и незаметная зависимость от текущей
 * даты сделала бы их результат невоспроизводимым.
 */
export function years(
  item: { yearFrom: number | null; yearTo: number | null },
  now: number,
): string {
  const { yearFrom, yearTo } = item;
  if (!yearFrom && !yearTo) return "";
  if (!yearFrom) return `по ${yearTo}`;
  if (!yearTo || yearTo >= now) return `с ${yearFrom}`;
  if (yearTo === yearFrom) return String(yearFrom);
  return `${yearFrom}–${yearTo}`;
}

/** «BMW 3 серии V (E90/E91/E92/E93)» — машина одной строкой. */
export function carName(
  mark: { name: string },
  model: { name: string },
  generation?: { name: string } | null,
): string {
  const parts = [mark.name, model.name];
  if (generation) parts.push(generation.name);
  return parts.join(" ");
}
