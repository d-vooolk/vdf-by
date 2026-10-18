#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { createJiti } from "jiti";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = process.env.DATABASE_PATH ?? path.join(ROOT, "var", "shop.db");
const BACKUP_DIR = path.join(path.dirname(DB_PATH), "backups");
const apply = process.argv.includes("--apply");
const port = process.env.PORT ?? "3011";

const jiti = createJiti(import.meta.url);
const { matchFrameCars, modelFitsTitle } = await jiti.import(path.join(ROOT, "src", "lib", "frame-cars.ts"));

const db = new Database(DB_PATH, apply ? {} : { readonly: true });

function loadCatalog() {
  const generations = db
    .prepare("SELECT id, model_id AS modelId, name, year_from AS yearFrom, year_to AS yearTo FROM car_generations")
    .all();
  const models = db.prepare("SELECT id, mark_id AS markId, name FROM car_models").all();
  const marks = db.prepare("SELECT id, name FROM car_marks").all();
  const byModel = Map.groupBy(generations, (generation) => generation.modelId);
  const byMark = Map.groupBy(
    models.map((model) => ({ id: model.id, markId: model.markId, name: model.name, generations: byModel.get(model.id) ?? [] })),
    (model) => model.markId,
  );
  return marks.map((mark) => ({ ...mark, models: byMark.get(mark.id) ?? [] }));
}

function cardKey(sku) {
  const parts = String(sku ?? "").trim().toUpperCase().split("-").filter(Boolean);
  return parts.length > 1 ? `${parts[0]}-${parts[parts.length - 1]}` : parts.join("-");
}

function latestCards() {
  const cards = new Map();
  const rows = db
    .prepare("SELECT card FROM vdf_export_items WHERE card IS NOT NULL ORDER BY export_id, position")
    .all();
  for (const row of rows) {
    try {
      const card = JSON.parse(row.card);
      if (card.article) cards.set(cardKey(card.article), card);
    } catch {
      continue;
    }
  }
  return cards;
}

const catalog = loadCatalog();
const generationName = new Map(
  db
    .prepare(
      `SELECT g.id, k.name || ' ' || m.name || ' ' || g.name || ' ' || IFNULL(g.year_from, '') || '–' || IFNULL(g.year_to, '') AS name
         FROM car_generations g JOIN car_models m ON m.id = g.model_id JOIN car_marks k ON k.id = m.mark_id`,
    )
    .all()
    .map((row) => [row.id, row.name]),
);
const cards = latestCards();
const products = db
  .prepare(
    `SELECT p.id, json_extract(p.data, '$.title') AS title, json_extract(p.data, '$.sku') AS sku, f.type
       FROM products p JOIN frame_type_products f ON f.product_id = p.id
      ORDER BY f.type, p.id`,
  )
  .all();
const linkedOf = db.prepare("SELECT generation_id AS id FROM product_cars WHERE product_id = ?");
const generationInfo = new Map(
  db
    .prepare("SELECT g.id, m.name AS modelName, g.year_from AS yearFrom, g.year_to AS yearTo FROM car_generations g JOIN car_models m ON m.id = g.model_id")
    .all()
    .map((row) => [row.id, row]),
);
const currentYear = new Date().getFullYear();

function titleRange(title) {
  const years = String(title).match(/((?:19|20)\d\d)\s*[—–-]\s*((?:19|20)\d\d)?/);
  return years ? { from: Number(years[1]), to: years[2] ? Number(years[2]) : currentYear } : null;
}

function outsideRange(id, range) {
  const generation = generationInfo.get(id);
  if (!range || !generation?.yearFrom) return false;
  return Math.min(range.to, generation.yearTo ?? currentYear) < Math.max(range.from, generation.yearFrom);
}

const changes = [];
let withoutCard = 0;
for (const product of products) {
  const card = cards.get(cardKey(product.sku));
  if (!card) {
    withoutCard += 1;
    continue;
  }
  const wanted = matchFrameCars(
    { title: card.title || product.title, mark: card.mark, model: card.model, cars: card.cars ?? [] },
    catalog,
  );
  const linked = linkedOf.all(product.id).map((row) => row.id);
  const title = card.title || product.title;
  const wantedModels = new Set(wanted.map((id) => generationInfo.get(id)?.modelName));
  const sameModel = linked.some((id) =>
    [...wantedModels].some((name) => modelFitsTitle(generationInfo.get(id)?.modelName ?? "", name ?? "", title)),
  );
  const range = titleRange(title);
  const inRange = linked.filter((id) => !outsideRange(id, range));
  const next = (sameModel || !wanted.length) && inRange.length ? inRange : wanted;
  if (!next.length) continue;
  const added = next.filter((id) => !linked.includes(id));
  const removed = linked.filter((id) => !next.includes(id));
  if (added.length || removed.length) changes.push({ product, wanted: next, added, removed });
}

for (const change of changes) {
  console.log(`\n${change.product.type} · ${change.product.sku} · ${change.product.title}`);
  for (const id of change.removed) console.log(`  − ${generationName.get(id) ?? id}`);
  for (const id of change.added) console.log(`  + ${generationName.get(id) ?? id}`);
}
console.log(
  `\nРамок: ${products.length}, без карточки vdf-light: ${withoutCard}, к исправлению: ${changes.length}`,
);

if (!apply) {
  console.log("Это пробный прогон. Записать: node scripts/fix-frame-cars.mjs --apply");
  process.exit(0);
}
if (!changes.length) process.exit(0);

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backup = path.join(BACKUP_DIR, `shop.before-frame-cars-${Date.now()}.db`);
await db.backup(backup);
console.log(`Копия базы: ${backup}`);

const remove = db.prepare("DELETE FROM product_cars WHERE product_id = ?");
const add = db.prepare("INSERT OR IGNORE INTO product_cars (product_id, generation_id) VALUES (?, ?)");
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
