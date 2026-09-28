#!/usr/bin/env node
/**
 * Снимает все фото с товаров выбранных разделов и удаляет файлы, которые
 * после этого нигде больше не используются.
 *
 *   node scripts/clear-category-photos.mjs                 показать, что удалится
 *   node scripts/clear-category-photos.mjs --apply         удалить (перед этим — копия базы)
 *   node scripts/clear-category-photos.mjs --slugs a,b,c   другие разделы (по адресу)
 *
 * Затрагивает общие галереи и галереи вариантов товаров, сгенерированные
 * картинки «рамка + авто» и сохранённые фото рамок с оформлением в типах.
 * Обложки разделов и видео не трогает. Подразделы выбранных разделов входят.
 *
 * Страницы сайта после этого нужно пересобрать (./deploy/deploy.sh) — иначе
 * в кеше останутся ссылки на удалённые файлы.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { env } from "../src/lib/env.mjs";
import { removeImageFiles } from "../src/lib/image-pipeline.mjs";
import { openDatabase } from "../src/lib/migrations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));
const BACKUP_DIR = env("BACKUP_DIR", path.join(ROOT, "var", "backups"));
const PUBLIC_DIR = path.join(ROOT, "public");
const DEFAULT_SLUGS = ["perehodnye-ramki", "stekla-far", "svetovody"];

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const apply = process.argv.includes("--apply");
const slugs = (arg("slugs") ?? DEFAULT_SLUGS.join(","))
  .split(",")
  .map((slug) => slug.trim())
  .filter(Boolean);

const db = openDatabase(Database, DB_PATH);

const roots = db
  .prepare(`SELECT id, name, slug FROM categories WHERE slug IN (${slugs.map(() => "?").join(",")})`)
  .all(...slugs);
const missing = slugs.filter((slug) => !roots.some((category) => category.slug === slug));
if (missing.length) {
  console.error(`\nНет разделов с адресом: ${missing.join(", ")}\n`);
  process.exit(1);
}
const children = db
  .prepare(`SELECT id, name, slug FROM categories WHERE parent_id IN (${roots.map(() => "?").join(",")})`)
  .all(...roots.map((category) => category.id));
const categories = [...roots, ...children];
const categoryIds = categories.map((category) => category.id);
const inCategories = `(${categoryIds.map(() => "?").join(",")})`;

const products = db
  .prepare(`SELECT id, data FROM products WHERE category_id IN ${inCategories}`)
  .all(...categoryIds);

const detached = new Set();
const changed = [];
for (const row of products) {
  const product = JSON.parse(row.data);
  let touched = false;
  for (const image of product.images ?? []) detached.add(image);
  if (product.images?.length) {
    product.images = [];
    touched = true;
  }
  for (const group of product.optionGroups ?? []) {
    for (const value of group.values ?? []) {
      if (!value.images?.length) continue;
      for (const image of value.images) detached.add(image);
      delete value.images;
      touched = true;
    }
  }
  if (touched) changed.push({ id: row.id, data: JSON.stringify(product) });
}

const frameTypes = db
  .prepare(
    `SELECT COUNT(*) AS n FROM frame_types
      WHERE category_id IN ${inCategories} AND (frame_image IS NOT NULL OR composer IS NOT NULL)`,
  )
  .get(...categoryIds).n;

function collectStrings(value, into) {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, into);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectStrings(item, into);
}

function usedElsewhere() {
  const used = new Set();
  const changedIds = new Set(changed.map((item) => item.id));
  const jsonSources = [
    ["SELECT id, data AS json FROM products", true],
    ["SELECT data AS json FROM categories", false],
    ["SELECT value AS json FROM settings", false],
    ["SELECT data AS json FROM articles", false],
  ];
  for (const [sql, isProducts] of jsonSources) {
    for (const row of db.prepare(sql).all()) {
      if (isProducts && changedIds.has(row.id)) continue;
      try {
        collectStrings(JSON.parse(row.json), used);
      } catch {
        used.add(row.json);
      }
    }
  }
  for (const item of changed) collectStrings(JSON.parse(item.data), used);
  const columnSources = [
    "SELECT logo AS path FROM car_marks WHERE logo <> ''",
    "SELECT photo AS path FROM car_generations WHERE photo <> ''",
    "SELECT image AS path FROM car_front_photos",
  ];
  for (const sql of columnSources) for (const row of db.prepare(sql).all()) used.add(row.path);
  return used;
}

const used = usedElsewhere();
const readImage = db.prepare("SELECT * FROM images WHERE path = ?");
const removable = [];
let kept = 0;
let unknown = 0;
for (const image of detached) {
  if (used.has(image)) {
    kept += 1;
    continue;
  }
  const entry = readImage.get(image);
  if (!entry) {
    unknown += 1;
    continue;
  }
  removable.push(entry);
}
const bytes = removable.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);

console.log(`Разделы: ${categories.map((category) => `${category.name} (${category.slug})`).join(", ")}`);
console.log(`Товаров в разделах: ${products.length}, с фото: ${changed.length}`);
console.log(`Фото снимется с товаров: ${detached.size}`);
console.log(`  файлы удалятся: ${removable.length} (${(bytes / 1024 / 1024).toFixed(1)} МБ)`);
console.log(`  останутся, потому что используются ещё где-то: ${kept}`);
if (unknown) console.log(`  нет в реестре фото (удалять нечего): ${unknown}`);
console.log(`Типов рамок с сохранённым фото рамки или оформлением: ${frameTypes}`);

if (!apply) {
  console.log("\nЭто пробный прогон. Удалить: node scripts/clear-category-photos.mjs --apply");
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const backupFile = path.join(BACKUP_DIR, `shop-before-photo-clear-${stamp}.db`);
await db.backup(backupFile);
console.log(`\nКопия базы: ${path.relative(ROOT, backupFile)}`);

const now = Date.now();
db.transaction(() => {
  const write = db.prepare("UPDATE products SET data = ?, updated_at = ? WHERE id = ?");
  for (const item of changed) write.run(item.data, now, item.id);
  db.prepare(
    `DELETE FROM frame_renders WHERE product_id IN (SELECT id FROM products WHERE category_id IN ${inCategories})`,
  ).run(...categoryIds);
  db.prepare(
    `UPDATE frame_types SET frame_image = NULL, composer = NULL, updated_at = ? WHERE category_id IN ${inCategories}`,
  ).run(now, ...categoryIds);
  const drop = db.prepare("DELETE FROM images WHERE path = ?");
  for (const entry of removable) drop.run(entry.path);
  for (const counter of ["catalog", "images"]) {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, '1')
       ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
    ).run(`counter:${counter}`);
  }
})();

let failed = 0;
for (const entry of removable) {
  try {
    await removeImageFiles({ sources: JSON.parse(entry.sources), fallback: entry.fallback }, PUBLIC_DIR);
  } catch (error) {
    failed += 1;
    console.error(`  не удалились файлы ${entry.path}: ${error.message}`);
  }
}

console.log(`Готово: фото сняты с ${changed.length} товаров, удалено фото: ${removable.length - failed}.`);
console.log("Пересоберите сайт, чтобы из кеша ушли старые страницы: ./deploy/deploy.sh");
