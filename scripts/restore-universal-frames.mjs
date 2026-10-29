#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import Database from "better-sqlite3";
import { createJiti } from "jiti";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = process.env.DATABASE_PATH ?? path.join(ROOT, "var", "shop.db");
const BACKUP_DIR = path.join(path.dirname(DB_PATH), "backups");
const apply = process.argv.includes("--apply");
const port = process.env.PORT ?? "3011";
const source = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

if (!source) {
  console.log("Укажите копию базы до разделения: node scripts/restore-universal-frames.mjs var/backups/shop-….db.gz [--apply]");
  process.exit(1);
}

const jiti = createJiti(import.meta.url);
const { homeBody, titleMatchScore, NAMED_IN_TITLE } = await jiti.import(path.join(ROOT, "src", "lib", "car-body.ts"));

function openSource(file) {
  if (!file.endsWith(".gz")) return new Database(file, { readonly: true });
  const plain = path.join(os.tmpdir(), `restore-universal-${process.pid}.db`);
  fs.writeFileSync(plain, zlib.gunzipSync(fs.readFileSync(file)));
  process.on("exit", () => fs.rmSync(plain, { force: true }));
  return new Database(plain, { readonly: true });
}

const CARS = `SELECT k.slug AS markSlug, k.name AS markName, m.slug AS modelSlug, m.name AS modelName,
                     g.id AS generationId, g.slug AS generationSlug, g.name AS generationName,
                     g.year_from AS yearFrom, g.year_to AS yearTo
                FROM product_cars pc
                JOIN car_generations g ON g.id = pc.generation_id
                JOIN car_models m ON m.id = g.model_id
                JOIN car_marks k ON k.id = m.mark_id
               WHERE pc.product_id = ?`;

const before = openSource(path.resolve(source));
const db = new Database(DB_PATH, apply ? {} : { readonly: true });

const products = db
  .prepare("SELECT p.id, p.title FROM products p JOIN frame_type_products f ON f.product_id = p.id")
  .all();
const carsBefore = before.prepare(CARS);
const idsNow = db.prepare("SELECT generation_id AS id FROM product_cars WHERE product_id = ?");

const changes = [];
for (const product of products) {
  const cars = carsBefore.all(product.id);
  if (cars.length < 2) continue;
  if (titleMatchScore(homeBody(cars, product.title), product.title) >= NAMED_IN_TITLE) continue;
  const now = new Set(idsNow.all(product.id).map((row) => row.id));
  const wanted = cars.map((car) => car.generationId);
  if (wanted.length === now.size && wanted.every((id) => now.has(id))) continue;
  changes.push({ product, wanted, now: now.size, cars });
}

for (const change of changes) {
  console.log(`\n${change.product.title}`);
  console.log(`  машин сейчас: ${change.now}, вернётся: ${change.wanted.length}`);
  console.log(`  ${change.cars.map((car) => `${car.markName} ${car.modelName} ${car.generationName}`).join("; ")}`);
}
console.log(`\nК возврату: ${changes.length}`);

if (!apply) {
  console.log("Это пробный прогон. Записать: добавьте --apply");
  process.exit(0);
}
if (!changes.length) process.exit(0);

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backup = path.join(BACKUP_DIR, `shop.before-restore-universal-${Date.now()}.db`);
await db.backup(backup);
console.log(`Копия базы: ${backup}`);

const remove = db.prepare("DELETE FROM product_cars WHERE product_id = ?");
const add = db.prepare(
  "INSERT OR IGNORE INTO product_cars (product_id, generation_id) SELECT ?, id FROM car_generations WHERE id = ?",
);
const bump = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)",
);
db.transaction(() => {
  for (const change of changes) {
    remove.run(change.product.id);
    for (const id of change.wanted) add.run(change.product.id, id);
  }
  bump.run("counter:catalog");
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
