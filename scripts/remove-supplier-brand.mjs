#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import {
  isSupplierBrand,
  mentionsSupplierBrand,
  stripSupplierBrand,
  stripSupplierSpecs,
} from "../src/lib/supplier-brand.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = process.env.DATABASE_PATH ?? path.join(ROOT, "var", "shop.db");
const BACKUP_DIR = path.join(path.dirname(DB_PATH), "backups");
const apply = process.argv.includes("--apply");
const sampleSize = Number(process.argv[process.argv.indexOf("--samples") + 1]) || 40;
const port = process.env.PORT ?? "3011";

const SKIP_KEYS = new Set(["images", "videos", "image", "cover", "slug", "id", "sku", "url", "href", "src", "poster"]);

const db = new Database(DB_PATH, apply ? {} : { readonly: true });
const now = Date.now();
const changes = [];
const leftovers = [];

function cleanDeep(value, key, where) {
  if (typeof value === "string") {
    if (SKIP_KEYS.has(key) || !mentionsSupplierBrand(value)) return value;
    const cleaned = stripSupplierBrand(value);
    if (cleaned !== value) changes.push({ where: `${where} ${key}`, before: value, after: cleaned });
    if (mentionsSupplierBrand(cleaned)) {
      for (const match of cleaned.matchAll(/.{0,60}(?:VDF|vdf|ВДФ)(?!\.by|\.BY|-light\.ru).{0,60}/g)) {
        leftovers.push(`${where} ${key}: …${match[0]}…`);
      }
    }
    return cleaned;
  }
  if (Array.isArray(value)) return value.map((item) => cleanDeep(item, key, where));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, cleanDeep(child, childKey, where)]),
    );
  }
  return value;
}

const takenSlugs = new Set(db.prepare("SELECT slug FROM products").all().map((row) => row.slug));
const slugMoves = new Map();
for (const { slug } of db.prepare("SELECT slug FROM products WHERE slug LIKE '%vdf%'").all()) {
  const next = slug.replace(/(^|-)vdf(?:-light|-electronics)?(?=-|$)/g, "").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  if (next && next !== slug && !takenSlugs.has(next)) {
    slugMoves.set(slug, next);
    takenSlugs.add(next);
  }
}

const productUpdates = [];
let brandCleared = 0;
let specsDropped = 0;
for (const row of db.prepare("SELECT id, slug, title, brand, data FROM products").all()) {
  const data = JSON.parse(row.data);
  const where = `товар ${row.slug}`;
  let brand = row.brand;
  if (isSupplierBrand(data.brand) || isSupplierBrand(brand)) {
    delete data.brand;
    brand = "";
    brandCleared += 1;
  }
  if (data.specs) {
    const before = data.specs.length;
    data.specs = stripSupplierSpecs(data.specs);
    specsDropped += before - data.specs.length;
  }
  const cleaned = cleanDeep(data, "data", where);
  const title = cleanDeep(row.title, "title", where);
  if ("title" in cleaned) cleaned.title = title;
  const slug = slugMoves.get(row.slug) ?? row.slug;
  if ("slug" in cleaned) cleaned.slug = slug;
  if (slug !== row.slug || title !== row.title || brand !== row.brand || JSON.stringify(cleaned) !== row.data) {
    productUpdates.push({ id: row.id, slug, title, brand, data: JSON.stringify(cleaned) });
  }
}

const categoryUpdates = [];
for (const row of db.prepare("SELECT id, slug, data FROM categories").all()) {
  const data = cleanDeep(JSON.parse(row.data), "data", `раздел ${row.slug}`);
  const json = JSON.stringify(data);
  if (json !== row.data) categoryUpdates.push({ id: row.id, data: json });
}

const carTextUpdates = [];
for (const row of db.prepare("SELECT category_id, model_id, text FROM car_texts").all()) {
  const text = cleanDeep(row.text, "text", `текст машины ${row.category_id}/${row.model_id}`);
  if (text !== row.text) carTextUpdates.push({ categoryId: row.category_id, modelId: row.model_id, text });
}

const articleUpdates = [];
for (const row of db.prepare("SELECT id, slug, title, data FROM articles").all()) {
  let source = row.data;
  for (const [from, to] of slugMoves) source = source.split(from).join(to);
  const data = cleanDeep(JSON.parse(source), "data", `статья ${row.slug}`);
  const title = cleanDeep(row.title, "title", `статья ${row.slug}`);
  const json = JSON.stringify(data);
  if (json !== row.data || title !== row.title) articleUpdates.push({ id: row.id, title, data: json });
}

console.log(`Товаров к изменению: ${productUpdates.length} (бренд убран у ${brandCleared}, строк «Производитель» в характеристиках убрано: ${specsDropped})`);
for (const [from, to] of slugMoves) console.log(`Адрес товара: /product/${from}/ → /product/${to}/ (с переадресацией 308)`);
console.log(`Разделов: ${categoryUpdates.length}, текстов машин: ${carTextUpdates.length}, статей: ${articleUpdates.length}`);
console.log(`Изменённых фрагментов текста: ${changes.length}, осталось упоминаний: ${leftovers.length}\n`);

const step = Math.max(1, Math.floor(changes.length / sampleSize));
for (let index = 0; index < changes.length && index / step < sampleSize; index += step) {
  const { where, before, after } = changes[index];
  const at = before.search(/VDF|vdf|ВДФ/);
  const from = Math.max(0, at - 80);
  console.log(`— ${where}\n  было:  …${before.slice(from, at + 120).replace(/\n/g, " ")}…\n  стало: …${after.slice(from, at + 100).replace(/\n/g, " ")}…`);
}
if (leftovers.length) {
  console.log("\nОстались упоминания (правила не справились):");
  for (const line of leftovers.slice(0, 200)) console.log(`  ${line.replace(/\n/g, " ")}`);
}

if (!apply) {
  console.log("\nПроверка: ничего не записано. Запись — с флагом --apply.");
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupFile = path.join(BACKUP_DIR, `shop-before-supplier-brand-${now}.db`);
await db.backup(backupFile);
console.log(`\nКопия базы: ${backupFile}`);

const bump = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, '1')
   ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
);
db.transaction(() => {
  const writeProduct = db.prepare(
    "UPDATE products SET slug = ?, title = ?, brand = ?, data = ?, updated_at = ? WHERE id = ?",
  );
  for (const update of productUpdates) {
    writeProduct.run(update.slug, update.title, update.brand, update.data, now, update.id);
  }
  const writeRedirect = db.prepare(
    `INSERT INTO redirects (from_path, to_path, created_at) VALUES (?, ?, ?)
     ON CONFLICT(from_path) DO UPDATE SET to_path = excluded.to_path, created_at = excluded.created_at`,
  );
  for (const [from, to] of slugMoves) writeRedirect.run(`/product/${from}/`, `/product/${to}/`, now);
  const writeCategory = db.prepare("UPDATE categories SET data = ?, updated_at = ? WHERE id = ?");
  for (const update of categoryUpdates) writeCategory.run(update.data, now, update.id);
  const writeCarText = db.prepare("UPDATE car_texts SET text = ?, updated_at = ? WHERE category_id = ? AND model_id = ?");
  for (const update of carTextUpdates) writeCarText.run(update.text, now, update.categoryId, update.modelId);
  const writeArticle = db.prepare("UPDATE articles SET title = ?, data = ?, updated_at = ? WHERE id = ?");
  for (const update of articleUpdates) writeArticle.run(update.title, update.data, now, update.id);
  bump.run("counter:catalog");
  bump.run("counter:articles");
})();
console.log("Записано.");

const keyFile = path.join(ROOT, "var", "cron-key");
if (fs.existsSync(keyFile)) {
  try {
    const response = await fetch(`http://localhost:${port}/api/cron/revalidate/`, {
      method: "POST",
      headers: { "x-cron-key": fs.readFileSync(keyFile, "utf8").trim() },
    });
    console.log(`Сброс кеша страниц: ${response.status}`);
  } catch (error) {
    console.log(`Сброс кеша страниц не удался: ${error.message}`);
  }
}
