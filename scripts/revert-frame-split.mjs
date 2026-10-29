#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import Database from "better-sqlite3";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = process.env.DATABASE_PATH ?? path.join(ROOT, "var", "shop.db");
const BACKUP_DIR = path.join(path.dirname(DB_PATH), "backups");
const apply = process.argv.includes("--apply");
const port = process.env.PORT ?? "3011";
const source = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

if (!source) {
  console.log("Укажите копию базы до разделения: node scripts/revert-frame-split.mjs var/backups/shop-….db.gz [--apply]");
  process.exit(1);
}

function openSource(file) {
  if (!file.endsWith(".gz")) return new Database(file, { readonly: true });
  const plain = path.join(os.tmpdir(), `revert-frame-split-${process.pid}.db`);
  fs.writeFileSync(plain, zlib.gunzipSync(fs.readFileSync(file)));
  process.on("exit", () => fs.rmSync(plain, { force: true }));
  return new Database(plain, { readonly: true });
}

const before = openSource(path.resolve(source));
const db = new Database(DB_PATH, apply ? {} : { readonly: true });
db.pragma("foreign_keys = ON");

const existedBefore = new Set(before.prepare("SELECT id FROM products").all().map((row) => row.id));
const backupTime = before.prepare("SELECT MAX(updated_at) AS at FROM products").get().at;

const typeNow = db.prepare("SELECT f.product_id AS id, f.category_id AS categoryId, f.type, p.slug, p.title, p.created_at AS createdAt FROM frame_type_products f JOIN products p ON p.id = f.product_id").all();
const created = typeNow.filter((row) => !existedBefore.has(row.id) && (row.createdAt ?? 0) > backupTime);

const carsNow = db.prepare("SELECT generation_id AS id FROM product_cars WHERE product_id = ?");
const carsBefore = before.prepare("SELECT generation_id AS id FROM product_cars WHERE product_id = ?");
const ownerBefore = before.prepare(
  `SELECT p.id, p.slug, p.title FROM product_cars pc
     JOIN frame_type_products f ON f.product_id = pc.product_id
     JOIN products p ON p.id = pc.product_id
    WHERE pc.generation_id = ? AND f.category_id = ? AND f.type = ? LIMIT 1`,
);

const removals = created.map((row) => {
  const owner = carsNow
    .all(row.id)
    .map((car) => ownerBefore.get(car.id, row.categoryId, row.type))
    .find(Boolean);
  return { ...row, owner };
});

const restores = [];
for (const row of before.prepare("SELECT product_id AS id FROM frame_type_products").all()) {
  const wanted = carsBefore.all(row.id).map((car) => car.id);
  const now = new Set(carsNow.all(row.id).map((car) => car.id));
  if (wanted.length === now.size && wanted.every((id) => now.has(id))) continue;
  restores.push({ id: row.id, wanted, now: now.size });
}

console.log(`Удалить карточек, созданных разделением: ${removals.length}`);
for (const row of removals) {
  console.log(`  − ${row.title}  →  ${row.owner ? row.owner.title : "перенаправление на раздел"}`);
}
console.log(`\nВернуть машины товарам: ${restores.length}`);
for (const row of restores) console.log(`  ${row.id}: ${row.now} → ${row.wanted.length}`);

if (!apply) {
  console.log("\nЭто пробный прогон. Записать: добавьте --apply");
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backup = path.join(BACKUP_DIR, `shop.before-revert-frame-split-${Date.now()}.db`);
await db.backup(backup);
console.log(`Копия базы: ${backup}`);

const categorySlug = db.prepare("SELECT slug FROM categories WHERE id = ?");
const redirect = db.prepare(
  `INSERT INTO redirects (from_path, to_path, created_at) VALUES (?, ?, ?)
   ON CONFLICT(from_path) DO UPDATE SET to_path = excluded.to_path, created_at = excluded.created_at`,
);
const removeProduct = db.prepare("DELETE FROM products WHERE id = ?");
const removeCars = db.prepare("DELETE FROM product_cars WHERE product_id = ?");
const addCar = db.prepare(
  "INSERT OR IGNORE INTO product_cars (product_id, generation_id) SELECT ?, id FROM car_generations WHERE id = ?",
);
const bump = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)",
);

db.transaction(() => {
  const now = Date.now();
  for (const row of removals) {
    const target = row.owner
      ? `/product/${row.owner.slug}/`
      : `/catalog/${categorySlug.get(row.categoryId)?.slug ?? ""}/`;
    redirect.run(`/product/${row.slug}/`, target, now);
    removeCars.run(row.id);
    removeProduct.run(row.id);
  }
  for (const row of restores) {
    removeCars.run(row.id);
    for (const id of row.wanted) addCar.run(row.id, id);
  }
  db.prepare("DELETE FROM settings WHERE key = 'frameSplitPending'").run();
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
