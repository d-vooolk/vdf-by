#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { env } from "../src/lib/env.mjs";
import { openDatabase } from "../src/lib/migrations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));

const FROM = { amount: 700, currency: "RUB" };
const TO = { amount: 6, currency: "USD" };
const apply = process.argv.includes("--apply");

function isOldSource(source) {
  return source?.currency === FROM.currency && source?.amount === FROM.amount;
}

function parse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function usdRate() {
  const response = await fetch("https://api.nbrb.by/exrates/rates/USD?parammode=2", {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`НБРБ ответил ${response.status}`);
  const data = await response.json();
  const rate = Number(data.Cur_OfficialRate) / (Number(data.Cur_Scale) || 1);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("НБРБ отдал непонятный курс USD");
  return { rate, date: String(data.Date ?? "").slice(0, 10) };
}

function toByn(amount, rate) {
  return Math.ceil(Math.round(amount * rate * 100) / 100);
}

const usd = await usdRate();
const newPrice = toByn(TO.amount, usd.rate);
const newSource = JSON.stringify(TO);

const db = openDatabase(Database, DB_PATH);

const types = db
  .prepare("SELECT category_id, type, price, price_source FROM frame_types WHERE price_source IS NOT NULL")
  .all()
  .filter((row) => isOldSource(parse(row.price_source)));

const products = db
  .prepare(
    `SELECT p.id, p.price, p.data, f.category_id, f.type
       FROM frame_type_products f
       JOIN products p ON p.id = f.product_id
      WHERE p.data LIKE '%"priceSource"%'`,
  )
  .all()
  .filter((row) => isOldSource(parse(row.data)?.priceSource));

console.log(`Курс НБРБ: 1 $ = ${usd.rate} BYN на ${usd.date}`);
console.log(`${FROM.amount} ${FROM.currency} → ${TO.amount} ${TO.currency} = ${newPrice} BYN\n`);

console.log(`Типы рамок: ${types.length}`);
for (const row of types) {
  console.log(`  ${row.category_id} / ${row.type}: ${row.price} → ${newPrice} BYN`);
}

console.log(`\nТовары в типах рамок: ${products.length}`);
for (const row of products) {
  const product = JSON.parse(row.data);
  console.log(`  ${row.type} · ${product.sku ?? row.id} · ${product.title}: ${row.price} → ${newPrice} BYN`);
}

if (!apply) {
  console.log("\nПробный прогон, база не изменена. Записать: node scripts/frame-prices-usd.mjs --apply");
  db.close();
  process.exit(0);
}

const now = Date.now();
const writeType = db.prepare(
  "UPDATE frame_types SET price = ?, price_source = ?, updated_at = ? WHERE category_id = ? AND type = ?",
);
const writeProduct = db.prepare("UPDATE products SET price = ?, data = ?, updated_at = ? WHERE id = ?");
const bumpCatalog = db.prepare(
  `INSERT INTO settings (key, value) VALUES ('counter:catalog', '1')
   ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
);

db.transaction(() => {
  for (const row of types) writeType.run(newPrice, newSource, now, row.category_id, row.type);
  for (const row of products) {
    const product = { ...JSON.parse(row.data), price: newPrice, priceSource: TO };
    writeProduct.run(newPrice, JSON.stringify(product), now, row.id);
  }
  if (products.length) bumpCatalog.run();
})();

db.close();
console.log(`\nГотово: типов ${types.length}, товаров ${products.length}.`);
