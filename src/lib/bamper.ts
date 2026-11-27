import { bamperModel } from "./bamper-models";
import { getProductCars } from "./cars";
import { carSearchName, generationBodyName, generationFamily, years, type ProductCar } from "./car-types";
import { getProducts, getSite } from "./catalog";
import { imagesFor } from "./feed";
import type { Product } from "./schema";
import { withUtmSource } from "./order-source";
import { absoluteUrl, variantUrl } from "./seo";
import { isSidesGroup, sideValues } from "./side-options";
import { toSlug } from "./slug.mjs";
import { defaultSelection, hasPrice, resolveVariant, sideStockOf, type Selection } from "./variant";

export const BAMPER_COLUMNS = [
  "ID_EXT",
  "МАРКА",
  "МОДЕЛЬ",
  "ГОД",
  "ЗАПЧАСТЬ",
  "ВЕРСИЯ",
  "ТОПЛИВО",
  "ОБЪЕМ",
  "ТИП ДВИГАТЕЛЯ",
  "КОРОБКА",
  "ТИП КУЗОВА",
  "R ДИАМЕТР",
  "J ШИРИНА",
  "КОЛ ОТВЕРСТИЙ",
  "ET ВЫЛЕТ",
  "DIA",
  "PCD",
  "НОМЕР",
  "ОПИСАНИЕ",
  "НОВАЯ",
  "ПОД ЗАКАЗ",
  "СКЛАДСКАЯ ИНФОРМАЦИЯ",
  "ЦЕНА",
  "ВАЛЮТА",
  "СКИДКА",
  "АДРЕС",
  "ТЕЛЕФОНЫ",
  "EMAIL",
  "ИМЯ",
  "ФОТО",
  "link",
] as const;

export type BamperRow = Partial<Record<(typeof BAMPER_COLUMNS)[number], string>>;

export type Side = "left" | "right";

export interface BamperKind {
  categoryId: string;
  part: Record<Side, string>;
  noun: string;
  fits: string;
}

export const KINDS: BamperKind[] = [
  {
    categoryId: "glasses",
    part: { left: "стекло фары левой", right: "стекло фары правой" },
    noun: "Новое стекло",
    fits: "Стекло фары подходит",
  },
  {
    categoryId: "korpusa-far",
    part: { left: "корпус фары левой", right: "корпус фары правой" },
    noun: "Новый корпус фары",
    fits: "Корпус фары подходит",
  },
];

const SIDE_LETTER: Record<Side, string> = { left: "L", right: "R" };
const SIDE_WORD: Record<Side, string> = { left: "левая", right: "правая" };
const OEM_SPEC = /^(oem|номер|оригинальн)/i;
export const PHOTO_LIMIT = 10;

export interface SideOffer {
  side: Side;
  selection: Selection;
  price: number;
  images: string[];
  onOrder: boolean;
  qty: number | null;
}

function sideOfText(text: string): Side | null {
  if (/(^|[^а-яё])лев/i.test(text)) return "left";
  if (/(^|[^а-яё])прав/i.test(text)) return "right";
  return null;
}

function singleSide(product: Product): Side | null {
  const spec = product.specs.find((entry) => /^сторона$/i.test(entry.name.trim()));
  return (spec && sideOfText(spec.value)) ?? sideOfText(product.title);
}

export function sideOffers(product: Product): SideOffer[] {
  const group = product.optionGroups.find(isSidesGroup);
  const sides = group ? sideValues(group) : null;

  if (!group || !sides) {
    const side = singleSide(product);
    const selection = defaultSelection(product);
    const variant = resolveVariant(product, selection);
    if (!side || !hasPrice(variant.price)) return [];
    const qty = product.stockQty ?? null;
    return [
      {
        side,
        selection,
        price: variant.price,
        images: variant.images,
        onOrder: !variant.inStock || qty === 0,
        qty,
      },
    ];
  }

  const counted = sideStockOf(product);
  return (["right", "left"] as const).flatMap((side) => {
    const value = side === "right" ? sides.right : sides.left;
    const selection = { ...defaultSelection(product), [group.id]: value.id };
    const variant = resolveVariant(product, selection);
    if (!hasPrice(variant.price)) return [];
    const qty = counted ? counted[side] : null;
    return [
      {
        side,
        selection,
        price: variant.price,
        images: variant.images,
        onOrder: !variant.inStock || qty === 0,
        qty,
      },
    ];
  });
}

function stockInfo(offer: SideOffer, product: Product): string {
  const stock = offer.onOrder ? "под заказ, нет на складе" : offer.qty !== null ? `${offer.qty} шт.` : "";
  return [stock, product.sku ? `артикул ${product.sku}` : ""].filter(Boolean).join(", ");
}

interface ModelFit {
  key: string;
  mark: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  bodies: string[];
}

function modelFits(cars: ProductCar[]): ModelFit[] {
  const fits = new Map<string, ModelFit>();
  for (const car of cars) {
    const target = bamperModel(car.markName, car.modelName, car.generationName);
    if (!target) continue;
    const key = toSlug(`${target.mark} ${target.model}`);
    const fit = fits.get(key) ?? {
      key,
      mark: target.mark,
      model: target.model,
      yearFrom: null,
      yearTo: null,
      bodies: [],
    };
    if (car.yearFrom && (!fit.yearFrom || car.yearFrom < fit.yearFrom)) fit.yearFrom = car.yearFrom;
    if (car.yearTo && (!fit.yearTo || car.yearTo > fit.yearTo)) fit.yearTo = car.yearTo;
    const body = generationBodyName(generationFamily(car.generationName));
    if (!fit.bodies.includes(body)) fit.bodies.push(body);
    fits.set(key, fit);
  }
  return [...fits.values()];
}

function versionOf(fit: ModelFit): string {
  const period =
    fit.yearFrom && fit.yearTo
      ? ` (${fit.yearFrom}-${fit.yearTo})`
      : fit.yearFrom
        ? ` (${fit.yearFrom}-)`
        : "";
  return `${fit.bodies.join("/")}${period}`;
}

export function fitsText(cars: ProductCar[], now: number): string {
  const oldestFirst = [...cars].sort((a, b) => (a.yearFrom ?? 0) - (b.yearFrom ?? 0));
  const names = oldestFirst.map((car) => {
    const name = carSearchName({ name: car.markName }, { name: car.modelName }, { name: car.generationName });
    const period = years(car, now);
    return period ? `${name} ${period}` : name;
  });
  return [...new Set(names)].join(", ");
}

export function oemNumbers(product: Product): string {
  const numbers = product.specs
    .filter((spec) => OEM_SPEC.test(spec.name.trim()))
    .flatMap((spec) => spec.value.split(/[,;\s]+/))
    .map((value) => value.trim())
    .filter((value) => /^[A-Za-z0-9.-]{4,}$/.test(value));
  return [...new Set(numbers)].join(",");
}

export function idBase(product: Product): string {
  return (product.sku || product.id).replace(/[^A-Za-z0-9]/g, "");
}

export function description(kind: BamperKind, side: Side, fits: string): string {
  return [
    `${kind.noun} лучшего качества.`,
    `Сторона: ${SIDE_WORD[side]}.`,
    `${kind.fits}: ${fits}.`,
    "Любой двигатель.",
    `Полный список товаров можно посмотреть на нашем сайте ${absoluteUrl("/").replace(/\/$/, "")}`,
  ].join(" ");
}

export function bamperRows(now: number = new Date().getFullYear()): BamperRow[] {
  const currency = getSite().currency;
  const rows: BamperRow[] = [];

  for (const kind of KINDS) {
    for (const product of getProducts()) {
      if (product.categoryId !== kind.categoryId) continue;
      const offers = sideOffers(product);
      if (!offers.length) continue;
      const cars = getProductCars(product.id);
      if (!cars.length) continue;
      const fits = fitsText(cars, now);
      const numbers = oemNumbers(product);

      for (const offer of offers) {
        const photos = imagesFor(offer.images.length ? offer.images : product.images)
          .slice(0, PHOTO_LIMIT)
          .join(",");
        for (const [index, fit] of modelFits(cars).entries()) {
          rows.push({
            ID_EXT: `${idBase(product)}${SIDE_LETTER[offer.side]}${index ? index + 1 : ""}`,
            МАРКА: fit.mark,
            МОДЕЛЬ: fit.model,
            ГОД: fit.yearFrom ? String(fit.yearFrom) : "",
            ЗАПЧАСТЬ: kind.part[offer.side],
            ВЕРСИЯ: versionOf(fit),
            НОМЕР: numbers,
            ОПИСАНИЕ: description(kind, offer.side, fits),
            НОВАЯ: "1",
            "ПОД ЗАКАЗ": offer.onOrder ? "1" : "0",
            "СКЛАДСКАЯ ИНФОРМАЦИЯ": stockInfo(offer, product),
            ЦЕНА: String(offer.price),
            ВАЛЮТА: currency,
            ФОТО: photos,
            link: withUtmSource(variantUrl(product, offer.selection), "bamper"),
          });
        }
      }
    }
  }

  return rows;
}

function csvField(value: string | undefined): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text ? `"${text.replace(/"/g, '""')}"` : "";
}

export function bamperCsv(rows: BamperRow[] = bamperRows()): string {
  const lines = [
    BAMPER_COLUMNS.map((column) => csvField(column)).join(";"),
    ...rows.map((row) => BAMPER_COLUMNS.map((column) => csvField(row[column])).join(";")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
