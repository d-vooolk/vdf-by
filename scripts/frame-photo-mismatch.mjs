#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import Database from "better-sqlite3";
import { createJiti } from "jiti";

import { toSlug } from "../src/lib/slug.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = process.env.DATABASE_PATH ?? path.join(ROOT, "var", "shop.db");
const fitmentSource = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const asCsv = process.argv.includes("--csv");

const jiti = createJiti(import.meta.url);
const { bodyKey, carForTitle, groupByBody } = await jiti.import(path.join(ROOT, "src", "lib", "car-body.ts"));

function open(file) {
  if (!file.endsWith(".gz")) return new Database(file, { readonly: true });
  const plain = path.join(os.tmpdir(), `frame-photo-mismatch-${process.pid}.db`);
  fs.writeFileSync(plain, zlib.gunzipSync(fs.readFileSync(file)));
  process.on("exit", () => fs.rmSync(plain, { force: true }));
  return new Database(plain, { readonly: true });
}

const db = new Database(DB_PATH, { readonly: true });
const fitmentDb = fitmentSource ? open(path.resolve(fitmentSource)) : db;

const CAR_COLUMNS = `k.slug AS markSlug, k.name AS markName, m.slug AS modelSlug, m.name AS modelName,
  g.id AS generationId, g.slug AS generationSlug, g.name AS generationName, g.year_from AS yearFrom, g.year_to AS yearTo`;

function shortModel(car) {
  const model = car.modelName.trim();
  return model.toLowerCase().startsWith(car.markName.toLowerCase()) ? model.slice(car.markName.length).trim() : model;
}

function label(car) {
  return `${car.markName} ${shortModel(car)} ${car.generationName}`.replace(/\s+/g, " ").trim();
}

const generations = db
  .prepare(
    `SELECT ${CAR_COLUMNS} FROM car_generations g
       JOIN car_models m ON m.id = g.model_id JOIN car_marks k ON k.id = m.mark_id
      WHERE g.id IN (SELECT generation_id FROM product_cars UNION SELECT generation_id FROM car_front_photos)`,
  )
  .all()
  .map((car) => ({ car, slug: toSlug(label(car)) }))
  .filter((entry) => entry.slug)
  .sort((a, b) => b.slug.length - a.slug.length);

function photoCar(file) {
  const name = path.posix.basename(file).replace(/\.[a-z]+$/i, "");
  return generations.find((entry) => name === entry.slug || name.startsWith(`${entry.slug}-`))?.car ?? null;
}

const carsOf = fitmentDb.prepare(
  `SELECT ${CAR_COLUMNS} FROM product_cars pc JOIN car_generations g ON g.id = pc.generation_id
     JOIN car_models m ON m.id = g.model_id JOIN car_marks k ON k.id = m.mark_id WHERE pc.product_id = ?`,
);
const existsInFitment = fitmentDb.prepare("SELECT 1 FROM products WHERE id = ?");

const products = db
  .prepare(
    `SELECT p.id, p.slug, p.title, p.data, f.type
       FROM products p JOIN frame_type_products f ON f.product_id = p.id
      ORDER BY p.title`,
  )
  .all();

const rows = [];
let unknown = 0;
for (const product of products) {
  if (fitmentSource && !existsInFitment.get(product.id)) continue;
  const image = JSON.parse(product.data).images?.[0];
  if (!image) continue;
  const shown = photoCar(image);
  if (!shown) {
    unknown += 1;
    continue;
  }
  const cars = carsOf.all(product.id);
  if (!cars.length) continue;
  const expected = carForTitle(cars, product.title);
  if (expected && bodyKey(expected) === bodyKey(shown)) continue;
  const fits = cars.some((car) => bodyKey(car) === bodyKey(shown));
  rows.push({
    title: product.title,
    url: `https://vdf.by/product/${product.slug}/`,
    type: product.type,
    shown: label(shown),
    expected: expected ? label(expected) : "",
    reason: fits ? "на фото другой кузов из применимости" : "на фото машина не из применимости",
    bodies: groupByBody(cars).map((body) => label(body[0]).replace(/ Рестайлинг.*$/, "")).join("; "),
  });
}

if (asCsv) {
  const cell = (value) => `"${String(value).replace(/"/g, '""')}"`;
  console.log(["Товар", "Ссылка", "Тип", "На фото", "По названию", "Причина", "Кузова в применимости"].map(cell).join(";"));
  for (const row of rows) {
    console.log([row.title, row.url, row.type, row.shown, row.expected, row.reason, row.bodies].map(cell).join(";"));
  }
} else {
  for (const row of rows) {
    console.log(`${row.title}\n  на фото: ${row.shown} · по названию: ${row.expected} · ${row.reason}\n  ${row.url}`);
  }
  console.log(`\nНесоответствий: ${rows.length}; фото без машины в имени файла (не проверены): ${unknown}; рамок всего: ${products.length}`);
}
