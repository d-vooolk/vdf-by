import type { ProductCar } from "./car-types";

const RESTYLING = /\s*рестайлинг(\s*\d+)?\s*$/i;

export function bodyName(generationName: string): string {
  return generationName.replace(RESTYLING, "").trim();
}

export function bodyKey(car: ProductCar): string {
  return `${car.markSlug}/${car.modelSlug}/${bodyName(car.generationName).toLowerCase()}`;
}

export function groupByBody(cars: ProductCar[]): ProductCar[][] {
  const groups = new Map<string, ProductCar[]>();
  for (const car of cars) {
    const key = bodyKey(car);
    groups.set(key, [...(groups.get(key) ?? []), car]);
  }
  return [...groups.values()].map((group) => group.sort((a, b) => (a.yearFrom ?? 0) - (b.yearFrom ?? 0)));
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^0-9a-zа-яё]+/i).filter(Boolean));
}

function bodyCodes(car: ProductCar): string[] {
  const name = bodyName(car.generationName);
  const inside = name.match(/\(([^)]+)\)/)?.[1] ?? "";
  const outside = name.replace(/\([^)]*\)/g, " ");
  return [...outside.split(/\s+/), ...inside.split(/[\s/,]+/)]
    .map((code) => code.trim().toLowerCase())
    .filter((code) => code.length > 0);
}

function titleYears(title: string): [number, number] | null {
  const spans = [...title.matchAll(/((?:19|20)\d{2})\s*[-–]\s*((?:19|20)\d{2})/g)];
  const last = spans.at(-1);
  return last ? [Number(last[1]), Number(last[2])] : null;
}

function overlap(car: ProductCar, span: [number, number] | null): number {
  if (!span || !car.yearFrom) return 0;
  const to = Math.min(car.yearTo ?? new Date().getFullYear(), span[1]);
  return Math.max(0, to - Math.max(car.yearFrom, span[0]) + 1);
}

export function titleMatchScore(cars: ProductCar[], title: string): number {
  const tokens = words(title);
  const span = titleYears(title);
  const named = cars.some((car) => bodyCodes(car).some((code) => tokens.has(code)));
  const modelNamed = cars.some((car) => [...words(car.modelName)].every((word) => tokens.has(word)));
  return (named ? 1000 : 0) + (modelNamed ? 100 : 0) + Math.max(0, ...cars.map((car) => overlap(car, span)));
}

export function carForTitle(cars: ProductCar[], title: string): ProductCar | undefined {
  const span = titleYears(title);
  const bodies = groupByBody(cars);
  const home = [...bodies].sort((a, b) => titleMatchScore(b, title) - titleMatchScore(a, title))[0];
  if (!home) return undefined;
  return [...home].sort((a, b) => overlap(b, span) - overlap(a, span) || (b.yearFrom ?? 0) - (a.yearFrom ?? 0))[0];
}

export function homeBody(cars: ProductCar[], title: string): ProductCar[] {
  const chosen = carForTitle(cars, title);
  return chosen ? cars.filter((car) => bodyKey(car) === bodyKey(chosen)) : [];
}
