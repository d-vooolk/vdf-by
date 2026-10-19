#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import sharp from "sharp";

import { env } from "../src/lib/env.mjs";
import { processImage } from "../src/lib/image-pipeline.mjs";
import { openDatabase } from "../src/lib/migrations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));
const BACKUP_DIR = env("BACKUP_DIR", path.join(ROOT, "var", "backups"));
const IMG_DIR = path.join(ROOT, "public", "img");
const TITLE_LIMIT = 65;
const BRAND_SUFFIX_LENGTH = " — VDF.BY".length;

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const apply = process.argv.includes("--apply");
const overwriteTexts = process.argv.includes("--overwrite-texts");
const port = arg("port", env("PORT", "3011"));
const libraryDir = arg("library", "/var/www/prime-auto/var/uploads/library");
const contentFile = arg("content", null);
if (!contentFile) {
  console.error("Укажите файл с контентом: --content scripts/seo-….json");
  process.exit(1);
}
const CONTENT = JSON.parse(fs.readFileSync(path.resolve(ROOT, contentFile), "utf8"));
const label = path.basename(contentFile, ".json");

sharp.cache(false);

const db = openDatabase(Database, DB_PATH);
const now = Date.now();
const problems = [];
const log = [];
const say = (line) => {
  log.push(line);
  console.log(line);
};

const readCategory = db.prepare("SELECT id, data FROM categories WHERE slug = ?");
const writeCategory = db.prepare("UPDATE categories SET data = ?, updated_at = ? WHERE id = ?");
const imageExists = db.prepare("SELECT 1 FROM images WHERE path = ?");
const insertImage = db.prepare(
  `INSERT INTO images (path, w, h, blur, sources, fallback, bytes, created_at)
   VALUES (@path, @w, @h, @blur, @sources, @fallback, @bytes, @createdAt)`,
);
const readSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const writeSetting = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);
const findModel = db.prepare(
  "SELECT mo.id, mo.name, m.name AS mark FROM car_models mo JOIN car_marks m ON m.id = mo.mark_id WHERE m.slug = ? AND mo.slug = ?",
);
const readCarText = db.prepare("SELECT text FROM car_texts WHERE category_id = ? AND model_id = ?");
const writeCarText = db.prepare(
  `INSERT INTO car_texts (category_id, model_id, text, updated_at) VALUES (?, ?, ?, ?)
   ON CONFLICT (category_id, model_id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
);
const bump = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, '1')
   ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
);

const libraryPhotos = Object.entries(CONTENT.libraryPhotos ?? {}).filter(([target]) => !imageExists.get(target));

function planLibraryPhotos() {
  for (const [target, source] of libraryPhotos) {
    const file = path.join(libraryDir, source);
    if (!fs.existsSync(file)) problems.push(`фото ${target}: нет файла ${file}`);
    else say(`фото ${target} ← библиотека ${source}`);
  }
}

function planCategory() {
  const spec = CONTENT.category;
  const row = readCategory.get(spec.slug);
  if (!row) throw new Error(`нет раздела ${spec.slug}`);
  const data = JSON.parse(row.data);

  const set = spec.set ?? {};
  if (set.seoTitle && set.seoTitle.length + BRAND_SUFFIX_LENGTH > TITLE_LIMIT) {
    problems.push(`title ${set.seoTitle.length} знаков — не влезет с « — VDF.BY»`);
  }
  if (set.seoDescription && set.seoDescription.length > 165) problems.push(`описание для поиска ${set.seoDescription.length} знаков`);

  for (const [field, value] of Object.entries(set)) {
    if (JSON.stringify(data[field] ?? null) === JSON.stringify(value)) continue;
    const size = typeof value === "string" ? `${value.length} знаков` : `${value.length} шт.`;
    say(`раздел ${spec.slug}: ${field} ${data[field] === undefined ? "добавлено" : "заменено"} (${size})`);
    data[field] = value;
  }
  for (const [from, to] of spec.replaceInDescription ?? []) {
    if (data.description?.includes(to)) continue;
    if (!data.description?.includes(from)) {
      problems.push(`раздел ${spec.slug}: в описании не найдено «${from}»`);
      continue;
    }
    data.description = data.description.replace(from, to);
    say(`раздел ${spec.slug}: описание — «${from}» → «${to}»`);
  }
  for (const [question, answer] of Object.entries(spec.faqAnswers ?? {})) {
    const item = (data.faq ?? []).find((entry) => entry.q.trim() === question);
    if (!item) {
      problems.push(`раздел ${spec.slug}: нет вопроса «${question}»`);
      continue;
    }
    if (item.a === answer) continue;
    say(`раздел ${spec.slug}: ответ на «${question}» заменён`);
    item.a = answer;
  }
  for (const [slug, fields] of Object.entries(spec.collections ?? {})) {
    const collection = (data.collections ?? []).find((entry) => entry.slug === slug);
    if (!collection) {
      problems.push(`раздел ${spec.slug}: нет подборки ${slug}`);
      continue;
    }
    if (fields.seoTitle && fields.seoTitle.length + BRAND_SUFFIX_LENGTH > TITLE_LIMIT) {
      problems.push(`подборка ${slug}: title ${fields.seoTitle.length} знаков — не влезет с « — VDF.BY»`);
    }
    if (fields.seoDescription && fields.seoDescription.length > 165) {
      problems.push(`подборка ${slug}: описание для поиска ${fields.seoDescription.length} знаков`);
    }
    for (const [field, value] of Object.entries(fields)) {
      if (JSON.stringify(collection[field] ?? null) === JSON.stringify(value)) continue;
      say(`подборка ${slug}: ${field} ${collection[field] === undefined ? "добавлено" : "заменено"}`);
      collection[field] = value;
    }
  }
  for (const entry of spec.faqAppend ?? []) {
    if ((data.faq ?? []).some((item) => item.q.trim() === entry.q)) continue;
    data.faq = [...(data.faq ?? []), entry];
    say(`раздел ${spec.slug}: добавлен вопрос «${entry.q}»`);
  }
  return JSON.stringify(data) === row.data ? null : { id: row.id, data };
}

function planWorkshopPhotos() {
  const sets = JSON.parse(readSetting.get("workshop_photos")?.value ?? "{}");
  const before = JSON.stringify(sets);
  for (const [kind, set] of Object.entries(CONTENT.workshopPhotos ?? {})) {
    for (const photo of set.photos) {
      const planned = libraryPhotos.some(([target]) => target === photo.image);
      if (!planned && !imageExists.get(photo.image)) problems.push(`набор ${kind}: нет фото ${photo.image}`);
    }
    if (JSON.stringify(sets[kind]) !== JSON.stringify(set)) say(`фото мастерской «${kind}»: ${set.photos.length} фото`);
    sets[kind] = set;
  }
  return JSON.stringify(sets) === before ? null : sets;
}

function readCarTexts(file) {
  const texts = new Map();
  let key = null;
  for (const line of fs.readFileSync(path.resolve(ROOT, file), "utf8").replace(/\r\n?/g, "\n").split("\n")) {
    const heading = line.match(/^##\s+(\S+)\s*$/);
    if (heading) {
      key = heading[1];
      texts.set(key, []);
    } else if (key) {
      texts.get(key).push(line);
    }
  }
  return [...texts].map(([entry, lines]) => [
    entry,
    lines
      .join("\n")
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean)
      .join("\n\n"),
  ]);
}

function planCarTexts() {
  if (!CONTENT.carTextsFile) return [];
  const categoryId = readCategory.get(CONTENT.category.slug)?.id;
  const plan = [];
  for (const [entry, text] of readCarTexts(CONTENT.carTextsFile)) {
    const [markSlug, modelSlug] = entry.split("/");
    const model = findModel.get(markSlug, modelSlug);
    if (!model) {
      problems.push(`текст модели ${entry}: нет такой модели`);
      continue;
    }
    if (!text) {
      problems.push(`текст модели ${entry}: пустой`);
      continue;
    }
    const existing = readCarText.get(categoryId, model.id)?.text;
    if (existing === text) continue;
    if (existing && !overwriteTexts) {
      say(`текст ${model.mark} ${model.name}: уже есть другой, не трогаю — перезаписать можно с --overwrite-texts`);
      continue;
    }
    say(`текст ${model.mark} ${model.name}: ${existing ? "заменить" : "добавить"}, ${text.length} знаков`);
    plan.push({ categoryId, modelId: model.id, text });
  }
  return plan;
}

async function importLibraryPhotos() {
  const stored = [];
  for (const [target, source] of libraryPhotos) {
    const result = await processImage({ source: path.join(libraryDir, source), relativePath: target, outDir: IMG_DIR, sharp });
    if (!result) throw new Error(`не картинка: ${source}`);
    stored.push({ path: target, ...result });
  }
  return stored;
}

async function revalidate() {
  const keyFile = path.join(ROOT, "var", "cron-key");
  if (!fs.existsSync(keyFile)) {
    say("! нет var/cron-key — кеш страниц не сброшен");
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

planLibraryPhotos();
const category = planCategory();
const workshopSets = planWorkshopPhotos();
const carTexts = planCarTexts();

if (problems.length) {
  console.log(`\nОшибки:\n${problems.map((line) => `- ${line}`).join("\n")}`);
  process.exit(1);
}

if (!apply) {
  console.log(
    `\nПроверка: раздел ${category ? "меняется" : "без изменений"}, фото мастерской ${workshopSets ? "меняются" : "без изменений"}, новых фото ${libraryPhotos.length}, текстов моделей ${carTexts.length}. Ничего не записано — запустите с --apply.`,
  );
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupFile = path.join(BACKUP_DIR, `shop-before-${label}-${now}.db`);
await db.backup(backupFile);
say(`копия базы: ${path.relative(ROOT, backupFile)}`);

const photos = await importLibraryPhotos();

db.transaction(() => {
  for (const photo of photos) {
    insertImage.run({
      path: photo.path,
      w: photo.entry.w,
      h: photo.entry.h,
      blur: photo.entry.blur,
      sources: JSON.stringify(photo.entry.sources),
      fallback: photo.entry.fallback,
      bytes: photo.bytes,
      createdAt: now,
    });
  }
  if (category) writeCategory.run(JSON.stringify(category.data), now, category.id);
  if (workshopSets) writeSetting.run("workshop_photos", JSON.stringify(workshopSets));
  for (const entry of carTexts) writeCarText.run(entry.categoryId, entry.modelId, entry.text, now);
  bump.run("counter:catalog");
  if (photos.length) bump.run("counter:images");
})();

await revalidate();

const reportFile = path.join(ROOT, "var", `${label}-${now}.txt`);
fs.writeFileSync(reportFile, `${log.join("\n")}\n`);
console.log(`\nГотово: раздел ${category ? "обновлён" : "без изменений"}, новых фото ${photos.length}, текстов моделей ${carTexts.length}. Отчёт: ${path.relative(ROOT, reportFile)}`);
