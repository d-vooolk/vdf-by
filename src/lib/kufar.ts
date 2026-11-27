import { createHash } from "node:crypto";
import {
  description,
  fitsText,
  idBase,
  KINDS,
  oemNumbers,
  PHOTO_LIMIT,
  sideOffers,
  type Side,
} from "./bamper";
import { getProductCars } from "./cars";
import type { ProductCar } from "./car-types";
import { getProducts, getSite } from "./catalog";
import { imagesFor, xml } from "./feed";
import { kufarCar } from "./kufar-models";
import { withUtmSource } from "./order-source";
import { variantUrl } from "./seo";

const MINSK_CITY_REGION = 7;
const MINSK_FRUNZENSKY_AREA = 30;
const SPARES_CATEGORY = 2040;
const PASSENGER_SPARES = 2;
const CONDITION_NEW = 2;
const SUBJECT_LIMIT = 100;
const BODY_LIMIT = 4000;
const CONTACT_LIMIT = 50;
const KUFAR_PHONE = /^\+375(25|29|33|44|24)\d{7}$/;

const PASSENGER_GROUP: Record<string, Record<Side, number>> = {
  glasses: { left: 920, right: 921 },
  "korpusa-far": { left: 1016, right: 1017 },
};

export interface KufarRecord {
  unid: string;
  subject: string;
  body: string;
  group: number;
  price: string;
  currency: string;
  brand: string;
  model: string | null;
  generation: string | null;
  partsNumber: string;
  partsCode: string;
  link: string;
  photos: string[];
}

interface KufarFit {
  brand: string;
  model: string | null;
  generations: Set<string | null>;
  title: string;
  yearFrom: number | null;
  yearTo: number | null;
}

function kufarFits(cars: ProductCar[]): KufarFit[] {
  const fits = new Map<string, KufarFit>();
  for (const car of cars) {
    const target = kufarCar(car.markName, car.modelName, car.generationName, car.yearFrom);
    if (!target) continue;
    const groupKey = target.model ?? target.brand;
    const fit = fits.get(groupKey) ?? {
      brand: target.brand,
      model: target.model,
      generations: new Set<string | null>(),
      title: target.model ? `${car.markName} ${car.modelName}` : car.markName,
      yearFrom: null,
      yearTo: null,
    };
    fit.generations.add(target.generation);
    if (car.yearFrom && (!fit.yearFrom || car.yearFrom < fit.yearFrom)) fit.yearFrom = car.yearFrom;
    if (car.yearTo && (!fit.yearTo || car.yearTo > fit.yearTo)) fit.yearTo = car.yearTo;
    fits.set(groupKey, fit);
  }
  return [...fits.values()];
}

function singleGeneration(fit: KufarFit): string | null {
  return fit.generations.size === 1 ? [...fit.generations][0] : null;
}

function period(fit: KufarFit): string {
  if (fit.yearFrom && fit.yearTo) return ` ${fit.yearFrom}-${fit.yearTo}`;
  if (fit.yearFrom) return ` с ${fit.yearFrom}`;
  return "";
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function limit(text: string, length: number): string {
  return text.length > length ? text.slice(0, length).trimEnd() : text;
}

function shortHash(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 8).toUpperCase();
}

export function kufarRecords(now: number = new Date().getFullYear()): KufarRecord[] {
  const currency = getSite().currency;
  const records: KufarRecord[] = [];

  for (const kind of KINDS) {
    const groups = PASSENGER_GROUP[kind.categoryId];
    for (const product of getProducts()) {
      if (product.categoryId !== kind.categoryId) continue;
      const offers = sideOffers(product);
      if (!offers.length) continue;
      const cars = getProductCars(product.id);
      if (!cars.length) continue;
      const fits = kufarFits(cars);
      const fitsList = fitsText(cars, now);
      const partsNumber = oemNumbers(product).split(",")[0];

      for (const offer of offers) {
        const photos = imagesFor(offer.images.length ? offer.images : product.images).slice(0, PHOTO_LIMIT);
        const body = [description(kind, offer.side, fitsList), offer.onOrder ? "Под заказ." : ""]
          .filter(Boolean)
          .join(" ");
        for (const fit of fits) {
          records.push({
            unid: `${idBase(product)}${offer.side === "left" ? "L" : "R"}${shortHash(fit.model ?? fit.brand)}`,
            subject: limit(`${capitalize(kind.part[offer.side])} ${fit.title}${period(fit)}`, SUBJECT_LIMIT),
            body: limit(body, BODY_LIMIT),
            group: groups[offer.side],
            price: offer.price.toFixed(2),
            currency,
            brand: fit.brand,
            model: fit.model,
            generation: singleGeneration(fit),
            partsNumber,
            partsCode: product.sku ?? "",
            link: withUtmSource(variantUrl(product, offer.selection), "kufar"),
            photos,
          });
        }
      }
    }
  }

  return records;
}

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function kufarPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const phone = `+${digits.startsWith("375") ? digits : `375${digits.replace(/^80/, "")}`}`;
  return KUFAR_PHONE.test(phone) ? phone : "";
}

function element(name: string, value: string | number | null | undefined, wrap = false): string {
  if (value === null || value === undefined || value === "") return "";
  return `<${name}>${wrap ? cdata(String(value)) : xml(value)}</${name}>`;
}

function photosXml(photos: string[]): string {
  if (!photos.length) return "";
  return ["<photos>", ...photos.map((photo) => `<photo picture="${xml(photo)}"/>`), "</photos>"].join("\n");
}

function recordXml(record: KufarRecord, phone: string, contactPerson: string): string {
  return [
    "<record>",
    element("unid", record.unid),
    element("area", MINSK_FRUNZENSKY_AREA),
    element("region", MINSK_CITY_REGION),
    element("remuneration_type", 1),
    element("subject", record.subject, true),
    element("body", record.body, true),
    element("category", SPARES_CATEGORY),
    element("type", "sell"),
    element("phone", phone),
    element("price", record.price),
    element("currency", record.currency),
    element("contact_person", contactPerson, true),
    element("condition", CONDITION_NEW),
    element("spares_type", PASSENGER_SPARES),
    element("spares_passenger_group", record.group),
    element("cars_brand_v2", record.brand),
    element("cars_model_v2", record.model),
    element("cars_gen_v2", record.generation),
    element("spares_parts_number", record.partsNumber, true),
    element("spares_parts_code", record.partsCode, true),
    element("link", record.link, true),
    photosXml(record.photos),
    "</record>",
  ]
    .filter(Boolean)
    .join("\n");
}

export function kufarXml(records: KufarRecord[] = kufarRecords()): string {
  const site = getSite();
  const phone = kufarPhone(site.phoneHref) || kufarPhone(site.phone);
  const contactPerson = limit(site.name, CONTACT_LIMIT);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<uedb>",
    "<records>",
    ...records.map((record) => recordXml(record, phone, contactPerson)),
    "</records>",
    "</uedb>",
    "",
  ].join("\n");
}
