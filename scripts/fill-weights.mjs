#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { env } from "../src/lib/env.mjs";
import { openDatabase } from "../src/lib/migrations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));
const apply = process.argv.includes("--apply");

const RULES = [
  { name: "Маски для линз", pattern: /маск/i, weight: 0.1 },
  { name: "Световоды", pattern: /световод/i, weight: 0.2 },
  { name: "SMD", pattern: /\bsmd\b/i, weight: 0.1 },
  { name: "Пыльники", pattern: /пыльник/i, weight: 0.5 },
];

function weighed(product) {
  const values = (product.optionGroups ?? []).flatMap((group) => group.values);
  return (
    (product.weight ?? 0) > 0 ||
    (values.length > 0 && values.every((value) => (value.weight ?? 0) > 0))
  );
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

const db = openDatabase(Database, DB_PATH);

const categories = db.prepare("SELECT id, name, parent_id FROM categories").all();
const categoryName = new Map(categories.map((category) => [category.id, category.name]));
const framed = new Set(
  db.prepare("SELECT product_id AS id FROM frame_type_products").all().map((row) => row.id),
);
const products = db
  .prepare("SELECT id, title, category_id AS categoryId, data FROM products ORDER BY title")
  .all();

const updates = [];
const claimed = new Set();
const skipped = [];

for (const rule of RULES) {
  const roots = categories.filter((category) => rule.pattern.test(category.name));
  const subtree = subtreeOf(
    roots.map((category) => category.id),
    categories,
  );
  const byCategory = roots.length > 0;
  const matches = products.filter((row) =>
    byCategory ? subtree.has(row.categoryId) : rule.pattern.test(row.title),
  );

  console.log(
    `\n${rule.name} — ${rule.weight} кг: ` +
      (byCategory
        ? `разделы ${roots.map((category) => `«${category.name}»`).join(", ")}`
        : "раздела нет, ищем по названию товара") +
      `, товаров ${matches.length}`,
  );

  for (const row of matches) {
    if (claimed.has(row.id)) continue;
    claimed.add(row.id);
    const product = JSON.parse(row.data);
    if (weighed(product)) continue;
    if (framed.has(row.id)) {
      skipped.push(`${row.title}: товар в типе рамки — вес задаётся в типе`);
      continue;
    }
    product.weight = rule.weight;
    updates.push({ id: row.id, product });
    console.log(`  ${row.title} (${categoryName.get(row.categoryId) ?? row.categoryId})`);
  }
}

console.log(`\nБудет изменено: ${updates.length}`);
if (skipped.length) {
  console.log(`Пропущено: ${skipped.length}`);
  for (const line of skipped) console.log(`  ${line}`);
}

if (!apply) {
  console.log("\nПробный прогон, база не изменена. Записать: node scripts/fill-weights.mjs --apply");
  db.close();
  process.exit(0);
}

const write = db.prepare("UPDATE products SET data = ?, updated_at = ? WHERE id = ?");
const now = Date.now();
db.transaction(() => {
  for (const update of updates) write.run(JSON.stringify(update.product), now, update.id);
})();
db.prepare(
  `INSERT INTO settings (key, value) VALUES ('counter:catalog', '1')
   ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
).run();

db.close();
console.log(`\nГотово: товаров ${updates.length}.`);
