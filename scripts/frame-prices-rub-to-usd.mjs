#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { env } from "../src/lib/env.mjs";
import { openDatabase } from "../src/lib/migrations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));
const port = process.env.PORT ?? "3011";
const apply = process.argv.includes("--apply");

const WHOLESALE_SHARE = 0.82;

function parse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function toByn(amount, rate) {
  return Math.ceil(Math.round(amount * rate * 100) / 100);
}

function usdKeepingByn(byn, rate) {
  let cents = Math.round((byn / rate) * 100);
  while (cents > 0 && toByn(cents / 100, rate) > byn) cents -= 1;
  while (toByn(cents / 100, rate) < byn) cents += 1;
  return cents / 100;
}

const db = openDatabase(Database, DB_PATH);

const report = parse(db.prepare("SELECT value FROM settings WHERE key = 'rates:report'").get()?.value);
const usd = report?.rates?.USD;
if (!usd?.rate) {
  console.log("В базе нет курса USD (rates:report) — сначала нужен пересчёт по курсу НБРБ.");
  db.close();
  process.exit(1);
}

const types = db
  .prepare(
    `SELECT category_id, type, name, price, price_source, wholesale_price, wholesale_source
       FROM frame_types
      ORDER BY category_id, type`,
  )
  .all()
  .filter((row) => parse(row.price_source)?.currency === "RUB" && row.price > 0);

const typeUpdates = types.map((row) => {
  const amount = usdKeepingByn(row.price, usd.rate);
  const update = {
    row,
    price: toByn(amount, usd.rate),
    priceSource: { amount, currency: "USD" },
    wholesale: null,
  };
  if (row.wholesale_price === null && row.wholesale_source === null) {
    const wholesaleAmount = Math.round(amount * WHOLESALE_SHARE * 100) / 100;
    update.wholesale = {
      price: toByn(wholesaleAmount, usd.rate),
      source: { amount: wholesaleAmount, currency: "USD" },
    };
  }
  return update;
});

const typeKey = (categoryId, type) => `${categoryId}\u0000${type}`;
const updateByKey = new Map(typeUpdates.map((update) => [typeKey(update.row.category_id, update.row.type), update]));

const productUpdates = db
  .prepare(
    `SELECT p.id, p.title, p.price, p.data, f.category_id, f.type
       FROM frame_type_products f
       JOIN products p ON p.id = f.product_id
      ORDER BY p.title`,
  )
  .all()
  .flatMap((row) => {
    const update = updateByKey.get(typeKey(row.category_id, row.type));
    if (!update) return [];
    const product = JSON.parse(row.data);
    const next = { ...product, price: update.price, priceSource: update.priceSource };
    if (update.wholesale) {
      next.wholesalePrice = update.wholesale.price;
      next.wholesaleSource = update.wholesale.source;
    }
    return [{ row, product, next }];
  });

const mismatched = typeUpdates.filter((update) => update.price !== update.row.price);
const withWholesale = typeUpdates.filter((update) => update.wholesale);

console.log(`Курс: 1 $ = ${usd.rate} BYN на ${usd.date}`);
console.log(`Опт там, где его нет: розница − ${Math.round((1 - WHOLESALE_SHARE) * 100)}%, в долларах`);
console.log(`\nТипы рамок с ценой в RUB: ${typeUpdates.length}, из них без опта: ${withWholesale.length}`);
for (const update of typeUpdates) {
  const { row } = update;
  const source = parse(row.price_source);
  console.log(
    `  ${row.type}${row.name ? ` · ${row.name}` : ""}: ${row.price} BYN, ${source.amount} RUB → ${update.priceSource.amount} USD = ${update.price} BYN` +
      (update.wholesale ? `; опт ${update.wholesale.source.amount} USD = ${update.wholesale.price} BYN` : ""),
  );
}
console.log(`\nТовары этих типов: ${productUpdates.length}`);
for (const { row, product, next } of productUpdates.filter(({ row, next }) => row.price !== next.price)) {
  console.log(`  цена товара отличалась от типа: ${product.sku ?? row.id} · ${row.title}: ${row.price} → ${next.price}`);
}
if (mismatched.length) {
  console.log(`\nВНИМАНИЕ: у ${mismatched.length} типов сумма в BYN не сохранилась бы — запись отменена.`);
  db.close();
  process.exit(1);
}

if (!apply) {
  console.log("\nПробный прогон, база не изменена. Записать: node scripts/frame-prices-rub-to-usd.mjs --apply");
  db.close();
  process.exit(0);
}

const now = Date.now();
const writeType = db.prepare(
  `UPDATE frame_types
      SET price = ?, price_source = ?, wholesale_price = ?, wholesale_source = ?, updated_at = ?
    WHERE category_id = ? AND type = ?`,
);
const writeProduct = db.prepare("UPDATE products SET price = ?, data = ?, updated_at = ? WHERE id = ?");
const bumpCatalog = db.prepare(
  `INSERT INTO settings (key, value) VALUES ('counter:catalog', '1')
   ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
);

db.transaction(() => {
  for (const update of typeUpdates) {
    const { row, wholesale } = update;
    writeType.run(
      update.price,
      JSON.stringify(update.priceSource),
      wholesale ? wholesale.price : row.wholesale_price,
      wholesale ? JSON.stringify(wholesale.source) : row.wholesale_source,
      now,
      row.category_id,
      row.type,
    );
  }
  for (const { row, next } of productUpdates) writeProduct.run(next.price, JSON.stringify(next), now, row.id);
  bumpCatalog.run();
})();

db.close();
console.log(`\nЗаписано: типов ${typeUpdates.length}, товаров ${productUpdates.length}.`);

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
