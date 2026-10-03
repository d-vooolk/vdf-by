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
const TITLE_LIMIT = 65;
const BUY_PHRASE = " — купить в Минске";

const apply = process.argv.includes("--apply");
const db = openDatabase(Database, DB_PATH);

const rows = db
  .prepare("SELECT id, data FROM products WHERE json_extract(data, '$.seoTitle') IS NOT NULL")
  .all();

const changed = [];
let skippedLong = 0;
for (const row of rows) {
  const product = JSON.parse(row.data);
  const title = product.seoTitle.trim();
  if (!title || /купить/i.test(title)) continue;
  const next = `${title.replace(/[\s,;:.—–-]+$/, "")}${BUY_PHRASE}`;
  if (next.length > TITLE_LIMIT) {
    skippedLong += 1;
    continue;
  }
  product.seoTitle = next;
  changed.push({ id: row.id, before: title, after: next, data: JSON.stringify(product) });
}

for (const item of changed.slice(0, 30)) console.log(`${item.before}\n  → ${item.after}`);
if (changed.length > 30) console.log(`… и ещё ${changed.length - 30}`);
console.log(
  `\nСвоих заголовков: ${rows.length}. Поменяется: ${changed.length}. ` +
    `Не влезает в ${TITLE_LIMIT} знаков, оставлено как есть: ${skippedLong}.`,
);

if (!apply || changed.length === 0) {
  if (!apply) console.log("\nЭто пробный прогон. Записать: node scripts/seo-titles.mjs --apply");
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const backupFile = path.join(BACKUP_DIR, `shop-before-seo-titles-${stamp}.db`);
await db.backup(backupFile);
console.log(`\nКопия базы: ${path.relative(ROOT, backupFile)}`);

const now = Date.now();
db.transaction(() => {
  const write = db.prepare("UPDATE products SET data = ?, updated_at = ? WHERE id = ?");
  for (const item of changed) write.run(item.data, now, item.id);
})();
console.log(`Записано: ${changed.length}. Пересоберите сайт: ./deploy/deploy.sh`);
