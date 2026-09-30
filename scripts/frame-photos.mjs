#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import sharp from "sharp";

import { env } from "../src/lib/env.mjs";
import { framePhotoJpeg, framePhotoPath, withFramePhoto } from "../src/lib/frame-photo.mjs";
import { processImage } from "../src/lib/image-pipeline.mjs";
import { openDatabase } from "../src/lib/migrations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));
const OUT_DIR = path.join(ROOT, "public", "img");

if (!fs.existsSync(DB_PATH)) {
  console.error(`Нет базы ${DB_PATH}`);
  process.exit(1);
}

const db = openDatabase(Database, DB_PATH);
const types = db
  .prepare("SELECT category_id AS categoryId, type, frame_image AS frame FROM frame_types WHERE frame_image IS NOT NULL")
  .all();
const members = db.prepare("SELECT product_id AS id FROM frame_type_products WHERE category_id = ? AND type = ?");
const readProduct = db.prepare("SELECT data FROM products WHERE id = ?");
const writeProduct = db.prepare("UPDATE products SET data = ?, updated_at = ? WHERE id = ?");
const imageExists = db.prepare("SELECT 1 FROM images WHERE path = ?");
const insertImage = db.prepare(
  `INSERT INTO images (path, w, h, blur, sources, fallback, bytes, created_at)
   VALUES (@path, @w, @h, @blur, @sources, @fallback, @bytes, @createdAt)
   ON CONFLICT(path) DO UPDATE SET
     w = @w, h = @h, blur = @blur, sources = @sources,
     fallback = @fallback, bytes = @bytes, created_at = @createdAt`,
);
const bump = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, '1')
   ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
);

let photos = 0;
let products = 0;
let failed = 0;

for (const { categoryId, type, frame } of types) {
  const photo = framePhotoPath(categoryId, type, frame);
  if (!imageExists.get(photo)) {
    const result = await processImage({
      source: await framePhotoJpeg(sharp, frame),
      relativePath: photo,
      outDir: OUT_DIR,
      sharp,
    }).catch((error) => {
      console.error(`Тип ${type}: ${error.message}`);
      return null;
    });
    if (!result) {
      failed++;
      continue;
    }
    insertImage.run({
      path: photo,
      w: result.entry.w,
      h: result.entry.h,
      blur: result.entry.blur,
      sources: JSON.stringify(result.entry.sources),
      fallback: result.entry.fallback,
      bytes: result.bytes,
      createdAt: Date.now(),
    });
    photos++;
  }

  const now = Date.now();
  db.transaction(() => {
    for (const { id } of members.all(categoryId, type)) {
      const row = readProduct.get(id);
      if (!row) continue;
      const product = JSON.parse(row.data);
      const images = withFramePhoto(product.images ?? [], photo);
      if (JSON.stringify(images) === JSON.stringify(product.images ?? [])) continue;
      product.images = images;
      writeProduct.run(JSON.stringify(product), now, id);
      products++;
    }
  })();
}

if (photos) bump.run("counter:images");
if (products) bump.run("counter:catalog");

console.log(`Фото рамок: создано ${photos}, товаров обновлено ${products}, ошибок ${failed}`);
db.close();
