#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { env } from "../src/lib/env.mjs";
import { openDatabase } from "../src/lib/migrations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));

const ROOT_CATEGORY_ID = "glasses";
const ROOT_CATEGORY_NAME = /^ст[её]кла\s+фар/i;
const apply = process.argv.includes("--apply");

const SIDES = [
  { side: "pair", factor: 2, label: /пар/i },
  { side: "left", factor: 1, label: /лев/i },
  { side: "right", factor: 1, label: /прав/i },
];

function sideOf(value) {
  return (
    SIDES.find((entry) => entry.side === value.id) ??
    SIDES.find((entry) => entry.label.test(value.label)) ??
    null
  );
}

function isSideGroup(group) {
  return SIDES.every((entry) => group.values.some((value) => sideOf(value) === entry));
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function describe(value) {
  return value.wholesaleSource
    ? `${value.wholesalePrice} BYN (${value.wholesaleSource.amount} ${value.wholesaleSource.currency})`
    : `${value.wholesalePrice ?? "—"} BYN`;
}

const db = openDatabase(Database, DB_PATH);

const categories = db.prepare("SELECT id, name, parent_id FROM categories").all();
const root = categories.find(
  (category) => category.id === ROOT_CATEGORY_ID || ROOT_CATEGORY_NAME.test(category.name),
);
if (!root) {
  console.error("Раздел «Стёкла фар» не найден");
  db.close();
  process.exit(1);
}

const subtree = new Set([root.id]);
for (let grown = true; grown; ) {
  grown = false;
  for (const category of categories) {
    if (category.parent_id && subtree.has(category.parent_id) && !subtree.has(category.id)) {
      subtree.add(category.id);
      grown = true;
    }
  }
}

const rows = db
  .prepare(
    `SELECT id, data FROM products
      WHERE category_id IN (${[...subtree].map(() => "?").join(", ")})
      ORDER BY title`,
  )
  .all(...subtree);

const updates = [];
const skipped = [];

for (const row of rows) {
  const product = JSON.parse(row.data);
  const wholesale = Number(product.wholesalePrice ?? 0);
  if (!(wholesale > 0)) {
    skipped.push(`${product.title}: нет оптовой цены у товара`);
    continue;
  }
  const groupIndex = (product.optionGroups ?? []).findIndex(isSideGroup);
  if (groupIndex === -1) {
    skipped.push(`${product.title}: нет опций «левое / правое / пара»`);
    continue;
  }
  if (groupIndex !== 0) {
    skipped.push(`${product.title}: опции сторон не первым набором — цену задаёт другой набор, правьте вручную`);
    continue;
  }

  const source = product.wholesaleSource ?? null;
  const changes = [];
  const group = product.optionGroups[groupIndex];
  group.values = group.values.map((value) => {
    const side = sideOf(value);
    if (!side) return value;
    const next = { ...value, wholesalePrice: roundMoney(wholesale * side.factor) };
    if (source) next.wholesaleSource = { amount: roundMoney(source.amount * side.factor), currency: source.currency };
    else delete next.wholesaleSource;
    if (JSON.stringify(next) !== JSON.stringify(value)) {
      changes.push(`${value.label}: ${describe(value)} → ${describe(next)}`);
    }
    return next;
  });

  if (changes.length) updates.push({ id: row.id, title: product.title, product, changes });
}

console.log(`Раздел: ${root.name} (${[...subtree].join(", ")}), товаров ${rows.length}`);
console.log(`\nБудет изменено: ${updates.length}`);
for (const update of updates) {
  console.log(`  ${update.title}`);
  for (const change of update.changes) console.log(`    ${change}`);
}
if (skipped.length) {
  console.log(`\nПропущено: ${skipped.length}`);
  for (const line of skipped) console.log(`  ${line}`);
}

if (!apply) {
  console.log("\nПробный прогон, база не изменена. Записать: node scripts/glass-wholesale-options.mjs --apply");
  db.close();
  process.exit(0);
}

const write = db.prepare("UPDATE products SET data = ?, updated_at = ? WHERE id = ?");
const now = Date.now();
db.transaction(() => {
  for (const update of updates) write.run(JSON.stringify(update.product), now, update.id);
})();

db.close();
console.log(`\nГотово: товаров ${updates.length}.`);
