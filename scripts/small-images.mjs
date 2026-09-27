#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import sharp from "sharp";

import { env } from "../src/lib/env.mjs";
import { FORMATS, SMALL_WIDTH } from "../src/lib/image-pipeline.mjs";
import { openDatabase } from "../src/lib/migrations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));
const PUBLIC_DIR = path.join(ROOT, "public");

if (!fs.existsSync(DB_PATH)) process.exit(0);

const db = openDatabase(Database, DB_PATH);
const rows = db.prepare("SELECT path, w, sources FROM images").all();
const update = db.prepare("UPDATE images SET sources = ? WHERE path = ?");

let done = 0;
let skipped = 0;

for (const row of rows) {
  const sources = JSON.parse(row.sources);
  const webp = sources.webp ?? [];
  if (!webp.length || webp.some((variant) => variant.w <= SMALL_WIDTH) || row.w <= SMALL_WIDTH) {
    skipped++;
    continue;
  }

  const smallest = [...webp].sort((a, b) => a.w - b.w)[0];
  const sourceFile = path.join(PUBLIC_DIR, smallest.url.replace(/^\//, ""));
  if (!fs.existsSync(sourceFile)) {
    skipped++;
    continue;
  }

  const next = { ...sources };
  for (const format of FORMATS) {
    const variants = sources[format.ext] ?? [];
    const template = variants.find((variant) => variant.w === smallest.w)?.url;
    if (!template) continue;
    const url = template.replace(new RegExp(`-${smallest.w}\\.${format.ext}$`), `-${SMALL_WIDTH}.${format.ext}`);
    if (url === template) continue;
    await sharp(sourceFile)
      .resize({ width: SMALL_WIDTH, withoutEnlargement: true })
      [format.ext](format.options)
      .toFile(path.join(PUBLIC_DIR, url.replace(/^\//, "")));
    next[format.ext] = [{ w: SMALL_WIDTH, url }, ...variants];
  }

  update.run(JSON.stringify(next), row.path);
  done++;
}

if (done) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('counter:images', '1')
     ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
  ).run();
}

console.log(`Мелкие версии фото: добавлено ${done}, пропущено ${skipped}`);
db.close();
