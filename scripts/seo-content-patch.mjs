#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { env } from "../src/lib/env.mjs";
import { openDatabase } from "../src/lib/migrations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));
const BACKUP_DIR = env("BACKUP_DIR", path.join(ROOT, "var", "backups"));

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const contentFile = arg("content");
if (!contentFile) {
  console.error("Укажите файл правок: --content scripts/seo-2026-10-26.json");
  process.exit(1);
}
const CONTENT = JSON.parse(fs.readFileSync(path.resolve(ROOT, contentFile), "utf8"));
const apply = process.argv.includes("--apply");
const port = arg("port", env("PORT", "3011"));

const db = openDatabase(Database, DB_PATH);
const now = Date.now();
const problems = [];
const log = [];
const say = (line) => {
  log.push(line);
  console.log(line);
};

const readProduct = db.prepare("SELECT id, title, data FROM products WHERE slug = ?");
const writeProduct = db.prepare("UPDATE products SET title = ?, data = ?, updated_at = ? WHERE id = ?");
const readArticle = db.prepare("SELECT id, title, data FROM articles WHERE slug = ?");
const writeArticle = db.prepare("UPDATE articles SET title = ?, data = ?, updated_at = ? WHERE id = ?");
const findGeneration = db.prepare(
  `SELECT g.id FROM car_generations g
     JOIN car_models m ON m.id = g.model_id
     JOIN car_marks k ON k.id = m.mark_id
    WHERE k.slug = ? AND m.slug = ? AND g.slug = ?`,
);
const hasCar = db.prepare("SELECT 1 FROM product_cars WHERE product_id = ? AND generation_id = ?");
const removeCar = db.prepare("DELETE FROM product_cars WHERE product_id = ? AND generation_id = ?");
const addCar = db.prepare("INSERT OR IGNORE INTO product_cars (product_id, generation_id) VALUES (?, ?)");
const bump = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, '1')
   ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
);

function generationId(carPath, where) {
  const [mark, model, generation] = carPath.split("/");
  const row = findGeneration.get(mark, model, generation);
  if (!row) problems.push(`${where}: нет поколения ${carPath}`);
  return row?.id;
}

function applyFields(data, spec, where) {
  for (const [field, value] of Object.entries(spec.set ?? {})) {
    if (data[field] === value) continue;
    say(`${where}: ${field}\n    было: ${data[field] ?? "—"}\n    стало: ${value}`);
    data[field] = value;
  }
  for (const [from, to] of spec.replaceInDescription ?? []) {
    if (!data.description?.includes(from)) {
      if (!data.description?.includes(to)) problems.push(`${where}: в описании не найдено «${from.trim()}»`);
      continue;
    }
    data.description = data.description.replace(from, to);
    say(`${where}: описание — «${from.trim()}» → «${to.trim() || "∅"}»`);
  }
}

function planProduct(spec) {
  const row = readProduct.get(spec.slug);
  if (!row) {
    problems.push(`нет товара ${spec.slug}`);
    return null;
  }
  const data = JSON.parse(row.data);
  applyFields(data, spec, spec.slug);
  if (data.seoTitle && data.seoTitle.length > 70) problems.push(`${spec.slug}: title ${data.seoTitle.length} знаков`);

  const cars = { remove: [], add: [] };
  for (const carPath of spec.cars?.remove ?? []) {
    const id = generationId(carPath, spec.slug);
    if (id && hasCar.get(row.id, id)) {
      cars.remove.push(id);
      say(`${spec.slug}: убрать привязку ${carPath}`);
    }
  }
  for (const carPath of spec.cars?.add ?? []) {
    const id = generationId(carPath, spec.slug);
    if (id && !hasCar.get(row.id, id)) {
      cars.add.push(id);
      say(`${spec.slug}: добавить привязку ${carPath}`);
    }
  }

  const changed = JSON.stringify(data) !== row.data;
  if (!changed && !cars.remove.length && !cars.add.length) return null;
  return { id: row.id, title: data.title, data: changed ? data : null, cars };
}

function planArticle(spec) {
  const row = readArticle.get(spec.slug);
  if (!row) {
    problems.push(`нет статьи ${spec.slug}`);
    return null;
  }
  const data = JSON.parse(row.data);
  for (const field of ["title", "seoTitle", "seoDescription", "excerpt"]) {
    if (spec[field] === undefined || data[field] === spec[field]) continue;
    say(`статья ${spec.slug}: ${field}\n    было: ${data[field] ?? "—"}\n    стало: ${spec[field]}`);
    data[field] = spec[field];
  }
  if (data.seoDescription && data.seoDescription.length > 165) {
    problems.push(`статья ${spec.slug}: описание для поиска ${data.seoDescription.length} знаков`);
  }
  return JSON.stringify(data) === row.data ? null : { id: row.id, data };
}

async function revalidate() {
  const keyFile = path.join(ROOT, "var", "cron-key");
  if (!fs.existsSync(keyFile)) {
    say("! нет var/cron-key — кеш страниц не сброшен");
    return;
  }
  try {
    const response = await fetch(`http://localhost:${port}/api/cron/revalidate/`, {
      method: "POST",
      headers: { "x-cron-key": fs.readFileSync(keyFile, "utf8").trim() },
    });
    say(`сброс кеша страниц: ${response.status}`);
  } catch (error) {
    say(`! сброс кеша страниц не удался: ${error.message}`);
  }
}

const products = (CONTENT.products ?? []).map(planProduct).filter(Boolean);
const articles = (CONTENT.articles ?? []).map(planArticle).filter(Boolean);

if (problems.length) {
  console.log(`\nОшибки:\n${problems.map((line) => `- ${line}`).join("\n")}`);
  process.exit(1);
}

if (!apply) {
  console.log(`\nПроверка: товаров к записи ${products.length}, статей ${articles.length}. Ничего не записано — запустите с --apply.`);
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupFile = path.join(BACKUP_DIR, `shop-before-seo-patch-${now}.db`);
await db.backup(backupFile);
say(`копия базы: ${path.relative(ROOT, backupFile)}`);

db.transaction(() => {
  for (const product of products) {
    if (product.data) writeProduct.run(product.title, JSON.stringify(product.data), now, product.id);
    for (const id of product.cars.remove) removeCar.run(product.id, id);
    for (const id of product.cars.add) addCar.run(product.id, id);
  }
  for (const article of articles) writeArticle.run(article.data.title, JSON.stringify(article.data), now, article.id);
  if (products.length) bump.run("counter:catalog");
  if (articles.length) bump.run("counter:articles");
})();

await revalidate();

const reportFile = path.join(ROOT, "var", `seo-patch-${now}.txt`);
fs.writeFileSync(reportFile, `${log.join("\n")}\n`);
console.log(`\nГотово: товаров ${products.length}, статей ${articles.length}. Отчёт: ${path.relative(ROOT, reportFile)}`);
