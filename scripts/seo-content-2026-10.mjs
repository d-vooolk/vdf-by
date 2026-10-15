#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import sharp from "sharp";

import { env } from "../src/lib/env.mjs";
import { processImage, safeImagePath } from "../src/lib/image-pipeline.mjs";
import { openDatabase } from "../src/lib/migrations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));
const BACKUP_DIR = env("BACKUP_DIR", path.join(ROOT, "var", "backups"));
const IMG_DIR = path.join(ROOT, "public", "img");
const CONTENT = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "seo-content-2026-10.json"), "utf8"));
const TITLE_LIMIT = 65;
const BRAND_SUFFIX_LENGTH = " — VDF.BY".length;

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const apply = process.argv.includes("--apply");
const overwriteTexts = process.argv.includes("--overwrite-texts");
const libraryDir = arg("library", "/var/www/prime-auto/var/uploads/library");
const keywordsFile = arg("keywords", path.join(ROOT, "var", "seo-keywords.json"));
const port = arg("port", env("PORT", "3011"));

sharp.cache(false);

const db = openDatabase(Database, DB_PATH);
const now = Date.now();
const log = [];
const say = (line) => {
  log.push(line);
  console.log(line);
};

const readCategory = db.prepare("SELECT id, data FROM categories WHERE slug = ?");
const writeCategory = db.prepare("UPDATE categories SET data = ?, updated_at = ? WHERE id = ?");
const readProduct = db.prepare("SELECT id, slug, title, category_id AS categoryId, data FROM products WHERE slug = ?");
const findProducts = db.prepare("SELECT id, slug, title, category_id AS categoryId, data FROM products WHERE title LIKE ?");
const writeProduct = db.prepare("UPDATE products SET title = ?, data = ?, updated_at = ? WHERE id = ?");
const productsInCategory = db.prepare(
  "SELECT id, slug, title, category_id AS categoryId, data FROM products WHERE category_id = ? ORDER BY title",
);
const imageExists = db.prepare("SELECT 1 FROM images WHERE path = ?");
const insertImage = db.prepare(
  `INSERT INTO images (path, w, h, blur, sources, fallback, bytes, created_at)
   VALUES (@path, @w, @h, @blur, @sources, @fallback, @bytes, @createdAt)`,
);
const readSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const writeSetting = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
);
const bump = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, '1')
   ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
);
const findModel = db.prepare(
  `SELECT mo.id FROM car_models mo JOIN car_marks m ON m.id = mo.mark_id WHERE m.slug = ? AND mo.slug = ?`,
);
const readCarText = db.prepare("SELECT text FROM car_texts WHERE category_id = ? AND model_id = ?");
const writeCarText = db.prepare(
  `INSERT INTO car_texts (category_id, model_id, text, updated_at) VALUES (?, ?, ?, ?)
   ON CONFLICT (category_id, model_id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
);

const changedProducts = new Map();
const changedCategories = new Map();

function productState(row) {
  if (!changedProducts.has(row.id)) {
    changedProducts.set(row.id, {
      id: row.id,
      slug: row.slug,
      title: row.title,
      data: JSON.parse(row.data),
      original: row.title + row.data,
    });
  }
  return changedProducts.get(row.id);
}

function categoryState(slug) {
  const row = readCategory.get(slug);
  if (!row) throw new Error(`нет раздела ${slug}`);
  if (!changedCategories.has(row.id)) {
    changedCategories.set(row.id, { id: row.id, data: JSON.parse(row.data), original: row.data });
  }
  return changedCategories.get(row.id);
}

function planCategories() {
  for (const [slug, fields] of Object.entries(CONTENT.categories)) {
    const state = categoryState(slug);
    for (const [field, value] of Object.entries(fields)) {
      const before = JSON.stringify(state.data[field] ?? null);
      if (before === JSON.stringify(value)) continue;
      state.data[field] = value;
      say(`раздел ${slug}: ${field} ${before === "null" ? "добавлено" : "заменено"}`);
    }
  }
}

function planGlassSeoDescriptions() {
  for (const [slug, text] of Object.entries(CONTENT.glassSeoDescriptions)) {
    const row = readProduct.get(slug);
    if (!row) {
      say(`! нет товара ${slug}`);
      continue;
    }
    const state = productState(row);
    if (state.data.seoDescription === text) continue;
    say(`${slug}: описание для поиска\n    было: ${String(state.data.seoDescription).replace(/\s+/g, " ")}\n    стало: ${text}`);
    state.data.seoDescription = text;
  }
}

function planDropLongSeoDescriptions() {
  const glassCategory = readCategory.get("stekla-far");
  for (const row of productsInCategory.all(glassCategory.id)) {
    const state = productState(row);
    const text = state.data.seoDescription ?? "";
    if (CONTENT.glassSeoDescriptions[row.slug] || (text.length <= 165 && !text.includes("\n"))) continue;
    delete state.data.seoDescription;
    say(`${row.slug}: убрано описание для поиска на ${text.length} знаков — его обрезало многоточием, теперь собирается из первого абзаца`);
  }
}

function planTitleFixes() {
  for (const [key, [from, to]] of Object.entries(CONTENT.titleFixes)) {
    const rows = key.startsWith("*") ? findProducts.all(`%${key.slice(1)}%`) : [readProduct.get(key)].filter(Boolean);
    if (!rows.length) say(`! не найден товар для правки названия: ${key}`);
    for (const row of rows) {
      const state = productState(row);
      if (!state.title.includes(from)) continue;
      const fixed = state.title.replace(from, to);
      say(`${row.slug}: название «${state.title}» → «${fixed}»`);
      state.title = fixed;
      state.data.title = fixed;
    }
  }
}

function planOptionLabelFixes() {
  for (const [slug, [from, to]] of Object.entries(CONTENT.optionLabelFixes)) {
    const row = readProduct.get(slug);
    if (!row) continue;
    const state = productState(row);
    for (const group of state.data.optionGroups ?? []) {
      for (const value of group.values) {
        if (value.label !== from) continue;
        value.label = to;
        say(`${slug}: вариант «${from}» → «${to}»`);
      }
    }
  }
}

function glassSeoTitle(title) {
  const base = title
    .replace(/^Стекло для фары\s+/i, "Стекло фары ")
    .replace(/^Стёкла для фар\s+/i, "Стекло фары ")
    .replace(/\((\d{4})\s*-\s*(\d{4})\)/g, "($1–$2)")
    .replace(/\s+/g, " ")
    .trim();
  const withBuy = `${base} — купить в Минске`;
  if (withBuy.length + BRAND_SUFFIX_LENGTH <= TITLE_LIMIT || withBuy.length <= TITLE_LIMIT) return withBuy;
  return base.length <= TITLE_LIMIT ? base : null;
}

function planGlassSeoTitles() {
  const glassCategory = readCategory.get("stekla-far");
  for (const row of productsInCategory.all(glassCategory.id)) {
    const state = productState(row);
    const title = CONTENT.glassSeoTitleOverrides[row.slug] ?? glassSeoTitle(state.title);
    if (!title) {
      say(`! ${row.slug}: заголовок не помещается в ${TITLE_LIMIT} знаков, оставляю как есть`);
      continue;
    }
    if (state.data.seoTitle === title) continue;
    say(`${row.slug}: title «${state.data.seoTitle ?? "(по умолчанию)"}» → «${title}»`);
    state.data.seoTitle = title;
  }
}

function planCarTexts() {
  const frames = readCategory.get("perehodnye-ramki");
  const plan = [];
  for (const [key, text] of Object.entries(CONTENT.frameCarTexts)) {
    const [mark, model] = key.split("/");
    const found = findModel.get(mark, model);
    if (!found) {
      say(`! нет модели ${key}`);
      continue;
    }
    const existing = readCarText.get(frames.id, found.id);
    if (existing && !overwriteTexts) {
      say(`текст рамок ${key}: уже есть, не трогаю (--overwrite-texts, чтобы заменить)`);
      continue;
    }
    plan.push({ categoryId: frames.id, modelId: found.id, text });
    say(`текст рамок ${key}: ${existing ? "заменить" : "добавить"}, ${text.length} знаков`);
  }
  return plan;
}

function freePath(folder, name) {
  let relativePath = safeImagePath(folder, name);
  const extension = path.extname(relativePath);
  const base = relativePath.slice(0, -extension.length);
  for (let counter = 2; imageExists.get(relativePath); counter += 1) {
    relativePath = `${base}-${counter}${extension}`;
  }
  return relativePath;
}

async function storeImage(source, folder, name) {
  const file = path.join(libraryDir, source);
  if (!fs.existsSync(file)) throw new Error(`нет файла ${file}`);
  const relativePath = freePath(folder, name);
  if (!apply) return { path: relativePath };
  const result = await processImage({ source: file, relativePath, outDir: IMG_DIR, sharp });
  if (!result) throw new Error(`не картинка: ${file}`);
  return { path: relativePath, ...result };
}

function recordImage(image) {
  insertImage.run({
    path: image.path,
    w: image.entry.w,
    h: image.entry.h,
    blur: image.entry.blur,
    sources: JSON.stringify(image.entry.sources),
    fallback: image.entry.fallback,
    bytes: image.bytes,
    createdAt: now,
  });
}

async function planWorkshopPhotos() {
  const current = JSON.parse(readSetting.get("workshop_photos")?.value ?? "{}");
  const stored = [];
  const sets = { ...current };
  for (const [kind, set] of Object.entries(CONTENT.workshopPhotos)) {
    if (current[kind]?.photos?.length) {
      say(`фото мастерской «${kind}»: уже заданы, не трогаю`);
      continue;
    }
    const photos = [];
    for (const photo of set.photos) {
      const image = await storeImage(photo.source, `workshop/${kind}`, photo.name);
      stored.push(image);
      photos.push({ image: image.path, caption: photo.caption });
      say(`фото мастерской «${kind}»: ${photo.source} → ${image.path}`);
    }
    sets[kind] = { title: set.title, lead: set.lead, photos };
  }
  return { stored, sets };
}

async function planProductPhotos() {
  const stored = [];
  for (const [slug, photo] of Object.entries(CONTENT.productPhotos)) {
    const row = readProduct.get(slug);
    if (!row) {
      say(`! нет товара ${slug}`);
      continue;
    }
    const state = productState(row);
    const already = (state.data.images ?? []).some((image) => image.endsWith(photo.name.replace(/\.[a-z]+$/i, ".webp")));
    if (already) {
      say(`${slug}: фото с машины уже стоит`);
      continue;
    }
    const image = await storeImage(photo.source, `${row.categoryId}/${row.id}`, photo.name);
    stored.push(image);
    state.data.images = [...(state.data.images ?? []), image.path];
    for (const group of state.data.optionGroups ?? []) {
      for (const value of group.values) {
        if (value.images?.length) value.images = [...value.images, image.path];
      }
    }
    say(`${slug}: в галерею добавлено фото установленного стекла ${image.path}`);
  }
  return stored;
}

function planKeywords() {
  if (!fs.existsSync(keywordsFile)) {
    say(`! нет файла ${keywordsFile}, цели фраз не меняю`);
    return null;
  }
  const keywords = JSON.parse(fs.readFileSync(keywordsFile, "utf8"));
  let changed = 0;
  for (const group of keywords.groups) {
    for (const keyword of group.keywords) {
      const slug = CONTENT.keywordTargets[keyword.q];
      if (!slug) continue;
      const url = `/product/${slug}/`;
      if (keyword.url === url) continue;
      say(`фраза «${keyword.q}»: ${keyword.url ?? group.url} → ${url}`);
      keyword.url = url;
      changed += 1;
    }
  }
  if (!changed) return null;
  keywords.updatedAt = new Date(now).toISOString();
  return keywords;
}

async function revalidate() {
  const keyFile = path.join(ROOT, "var", "cron-key");
  if (!fs.existsSync(keyFile)) {
    say("! нет var/cron-key — кеш страниц не сброшен, перезапустите деплой");
    return;
  }
  try {
    const response = await fetch(`http://localhost:${port}/api/cron/revalidate/`, {
      method: "POST",
      headers: { "x-cron-key": fs.readFileSync(keyFile, "utf8").trim() },
    });
    say(`сброс кеша страниц: ${response.status}`);
  } catch (error) {
    say(`! сброс кеша страниц не удался: ${error.message}`);
  }
}

function dropUnchanged() {
  for (const [id, product] of changedProducts) {
    if (product.title + JSON.stringify(product.data) === product.original) changedProducts.delete(id);
  }
  for (const [id, category] of changedCategories) {
    if (JSON.stringify(category.data) === category.original) changedCategories.delete(id);
  }
}

planCategories();
planGlassSeoDescriptions();
planDropLongSeoDescriptions();
planTitleFixes();
planOptionLabelFixes();
planGlassSeoTitles();
const carTexts = planCarTexts();
const keywords = planKeywords();
dropUnchanged();

if (!apply) {
  for (const [kind, set] of Object.entries(CONTENT.workshopPhotos)) {
    for (const photo of set.photos) {
      const file = path.join(libraryDir, photo.source);
      say(`фото мастерской «${kind}»: ${photo.source} ${fs.existsSync(file) ? "найдено" : "НЕ НАЙДЕНО"}`);
    }
  }
  for (const [slug, photo] of Object.entries(CONTENT.productPhotos)) {
    const file = path.join(libraryDir, photo.source);
    say(`${slug}: фото ${photo.source} ${fs.existsSync(file) ? "найдено" : "НЕ НАЙДЕНО"}`);
  }
  console.log(
    `\nПроверка: разделов ${changedCategories.size}, товаров ${changedProducts.size}, текстов машин ${carTexts.length}. Ничего не записано — запустите с --apply.`,
  );
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupFile = path.join(BACKUP_DIR, `shop-before-seo-content-${now}.db`);
await db.backup(backupFile);
say(`копия базы: ${path.relative(ROOT, backupFile)}`);

const workshop = await planWorkshopPhotos();
const productImages = await planProductPhotos();
dropUnchanged();

db.transaction(() => {
  for (const image of [...workshop.stored, ...productImages]) recordImage(image);
  writeSetting.run("workshop_photos", JSON.stringify(workshop.sets));
  for (const category of changedCategories.values()) {
    writeCategory.run(JSON.stringify(category.data), now, category.id);
  }
  for (const product of changedProducts.values()) {
    writeProduct.run(product.title, JSON.stringify(product.data), now, product.id);
  }
  for (const entry of carTexts) writeCarText.run(entry.categoryId, entry.modelId, entry.text, now);
  bump.run("counter:catalog");
  bump.run("counter:images");
})();

if (keywords) {
  fs.copyFileSync(keywordsFile, path.join(BACKUP_DIR, `seo-keywords-before-${now}.json`));
  fs.writeFileSync(keywordsFile, `${JSON.stringify(keywords, null, 2)}\n`);
  say(`цели фраз записаны в ${path.relative(ROOT, keywordsFile)}`);
}

await revalidate();

const reportFile = path.join(ROOT, "var", `seo-content-${now}.txt`);
fs.writeFileSync(reportFile, `${log.join("\n")}\n`);
console.log(`\nГотово: разделов ${changedCategories.size}, товаров ${changedProducts.size}, текстов машин ${carTexts.length}. Отчёт: ${path.relative(ROOT, reportFile)}`);
