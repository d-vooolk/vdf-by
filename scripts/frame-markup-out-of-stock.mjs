#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { env } from "../src/lib/env.mjs";
import { openDatabase } from "../src/lib/migrations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));

const MARKUP = 1.4;
const DONE_KEY = "markup:frames-out-of-stock-40";
const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");

function raisePrice(price) {
  return Math.ceil(Math.round(price * MARKUP * 100) / 100);
}

function raiseSource(source) {
  return source ? { ...source, amount: Math.round(source.amount * MARKUP * 100) / 100 } : source;
}

function describeSource(before, after) {
  return before ? ` (${before.amount} → ${after.amount} ${before.currency})` : "";
}

function parse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function subtreeOf(rootIds, categories) {
  const subtree = new Set(rootIds);
  for (let grown = true; grown; ) {
    grown = false;
    for (const category of categories) {
      if (category.parent_id && subtree.has(category.parent_id) && !subtree.has(category.id)) {
        subtree.add(category.id);
        grown = true;
      }
    }
  }
  return subtree;
}

function raiseOptions(optionGroups) {
  let raised = 0;
  const groups = optionGroups?.map((group) => ({
    ...group,
    values: group.values.map((value) => {
      if (!(value.price > 0)) return value;
      raised += 1;
      return { ...value, price: raisePrice(value.price), priceSource: raiseSource(value.priceSource) };
    }),
  }));
  return { groups, raised };
}

const db = openDatabase(Database, DB_PATH);

const previousRun = db.prepare("SELECT value FROM settings WHERE key = ?").get(DONE_KEY);
if (previousRun && !force) {
  console.log(`Наценка уже применялась ${previousRun.value}. Повторный запуск поднимет цены ещё раз.`);
  console.log("Если это действительно нужно, добавьте --force.");
  db.close();
  process.exit(1);
}

const categories = db.prepare("SELECT id, name, parent_id, data FROM categories").all();
const frameRoots = categories.filter((category) => parse(category.data)?.frameTypes === true);
const frameCategoryIds = subtreeOf(
  frameRoots.map((category) => category.id),
  categories,
);
const categoryName = new Map(categories.map((category) => [category.id, category.name]));

const typeKey = (categoryId, type) => `${categoryId}\u0000${type}`;

const types = db
  .prepare(
    `SELECT category_id, type, name, price, price_source, in_stock, stock_qty
       FROM frame_types
      ORDER BY category_id, type`,
  )
  .all();
const typeByKey = new Map(types.map((row) => [typeKey(row.category_id, row.type), row]));
const typeOutOfStock = (row) => !row.in_stock;

const membership = new Map(
  db
    .prepare("SELECT product_id, category_id, type FROM frame_type_products")
    .all()
    .map((row) => [row.product_id, typeKey(row.category_id, row.type)]),
);

const typeUpdates = types
  .filter((row) => typeOutOfStock(row) && row.price > 0)
  .map((row) => {
    const source = parse(row.price_source);
    return { row, price: raisePrice(row.price), source, nextSource: raiseSource(source) };
  });

const typeUpdateByKey = new Map(
  typeUpdates.map((update) => [typeKey(update.row.category_id, update.row.type), update]),
);

const products = db
  .prepare("SELECT id, title, price, in_stock, category_id, data FROM products ORDER BY title")
  .all()
  .filter((row) => frameCategoryIds.has(row.category_id) || membership.has(row.id));

const productUpdates = [];
for (const row of products) {
  const key = membership.get(row.id);
  const savedType = typeByKey.get(key);
  const outOfStock = savedType ? typeOutOfStock(savedType) : !row.in_stock;
  if (!outOfStock) continue;

  const product = JSON.parse(row.data);
  const typeUpdate = typeUpdateByKey.get(key);
  if (savedType) {
    if (!typeUpdate) continue;
    const next = { ...product, price: typeUpdate.price, priceSource: typeUpdate.nextSource };
    if (!typeUpdate.nextSource) delete next.priceSource;
    productUpdates.push({ row, product, next, optionsRaised: 0, typed: true });
    continue;
  }

  const { groups, raised: optionsRaised } = raiseOptions(product.optionGroups);
  if (!(row.price > 0) && optionsRaised === 0) continue;

  const price = row.price > 0 ? raisePrice(row.price) : row.price;
  const next = { ...product, price, priceSource: raiseSource(product.priceSource) };
  if (product.optionGroups) next.optionGroups = groups;
  if (!product.priceSource) delete next.priceSource;

  productUpdates.push({ row, product, next, optionsRaised, typed: false });
}

console.log(`Наценка: +${Math.round((MARKUP - 1) * 100)}% к розничной цене, опт и закупка не меняются`);
console.log(
  `Разделы рамок: ${[...frameCategoryIds].map((id) => `«${categoryName.get(id) ?? id}»`).join(", ") || "не найдены"}`,
);

console.log(`\nТипы рамок не в наличии: ${typeUpdates.length}`);
for (const update of typeUpdates) {
  const { row } = update;
  console.log(
    `  ${categoryName.get(row.category_id) ?? row.category_id} / ${row.type}${row.name ? ` · ${row.name}` : ""}: ` +
      `${row.price} → ${update.price} BYN${describeSource(update.source, update.nextSource)}`,
  );
}

console.log(`\nТовары не в наличии: ${productUpdates.length}`);
for (const update of productUpdates) {
  const { row, product, next } = update;
  console.log(
    `  ${product.sku ?? row.id} · ${row.title}: ${row.price} → ${next.price} BYN` +
      describeSource(product.priceSource, next.priceSource) +
      (update.optionsRaised ? `, опций с ценой ${update.optionsRaised}` : "") +
      (update.typed ? "" : ", без типа"),
  );
}

if (!apply) {
  console.log("\nПробный прогон, база не изменена. Записать: node scripts/frame-markup-out-of-stock.mjs --apply");
  db.close();
  process.exit(0);
}

const now = Date.now();
const writeType = db.prepare(
  "UPDATE frame_types SET price = ?, price_source = ?, updated_at = ? WHERE category_id = ? AND type = ?",
);
const writeProduct = db.prepare("UPDATE products SET price = ?, data = ?, updated_at = ? WHERE id = ?");
const markDone = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);
const bumpCatalog = db.prepare(
  `INSERT INTO settings (key, value) VALUES ('counter:catalog', '1')
   ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
);

db.transaction(() => {
  for (const update of typeUpdates) {
    writeType.run(
      update.price,
      update.nextSource ? JSON.stringify(update.nextSource) : null,
      now,
      update.row.category_id,
      update.row.type,
    );
  }
  for (const update of productUpdates) {
    writeProduct.run(update.next.price, JSON.stringify(update.next), now, update.row.id);
  }
  markDone.run(DONE_KEY, new Date(now).toISOString());
  bumpCatalog.run();
})();

db.close();
console.log(`\nГотово: типов ${typeUpdates.length}, товаров ${productUpdates.length}.`);
