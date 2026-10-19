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
const CONTENT_DIR = path.join(ROOT, "scripts", "seo-glass-2026-10");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));
const BACKUP_DIR = env("BACKUP_DIR", path.join(ROOT, "var", "backups"));
const IMG_DIR = path.join(ROOT, "public", "img");
const CONTENT = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, "content.json"), "utf8"));

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const apply = process.argv.includes("--apply");
const overwrite = process.argv.includes("--overwrite");
const port = arg("port", env("PORT", "3011"));
const libraryDir = arg("library", "/var/www/prime-auto/var/uploads/library");

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
const productExists = db.prepare("SELECT 1 FROM products WHERE slug = ?");
const imageExists = db.prepare("SELECT 1 FROM images WHERE path = ?");
const readArticle = db.prepare("SELECT id, status, data FROM articles WHERE slug = ?");
const insertArticle = db.prepare(
  `INSERT INTO articles (slug, title, status, data, created_at, updated_at, published_at)
   VALUES (?, ?, 'published', ?, ?, ?, ?)`,
);
const updateArticle = db.prepare(
  "UPDATE articles SET title = ?, status = 'published', data = ?, updated_at = ?, published_at = COALESCE(published_at, ?) WHERE id = ?",
);
const insertImage = db.prepare(
  `INSERT INTO images (path, w, h, blur, sources, fallback, bytes, created_at)
   VALUES (@path, @w, @h, @blur, @sources, @fallback, @bytes, @createdAt)`,
);
const bump = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, '1')
   ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
);

const categoryPaths = new Set(
  db
    .prepare("SELECT c.slug, p.slug AS parent FROM categories c LEFT JOIN categories p ON p.id = c.parent_id")
    .all()
    .map((row) => `/catalog/${row.parent ? `${row.parent}/` : ""}${row.slug}/`),
);
const articleSlugs = new Set([
  ...db.prepare("SELECT slug FROM articles WHERE status = 'published'").all().map((row) => row.slug),
  ...CONTENT.articles.map((article) => article.slug),
]);
const STATIC_PAGES = new Set(["/", "/catalog/", "/stati/", "/ustanovka/", "/delivery/", "/contacts/", "/about/"]);

function checkLink(href, where) {
  const clean = href.split(/[?#]/)[0];
  const product = clean.match(/^\/product\/([a-z0-9-]+)\/$/);
  const article = clean.match(/^\/stati\/([a-z0-9-]+)\/$/);
  const ok = product
    ? productExists.get(product[1])
    : article
      ? articleSlugs.has(article[1])
      : clean.startsWith("/catalog/")
        ? categoryPaths.has(clean)
        : STATIC_PAGES.has(clean);
  if (!ok) problems.push(`${where}: ссылка ${href} никуда не ведёт`);
}

const libraryPhotos = Object.entries(CONTENT.libraryPhotos ?? {}).filter(([target]) => !imageExists.get(target));

function planLibraryPhotos() {
  for (const [target, source] of libraryPhotos) {
    const file = path.join(libraryDir, source);
    if (!fs.existsSync(file)) problems.push(`фото ${target}: нет файла ${file}`);
    else say(`фото ${target} ← библиотека ${source}`);
  }
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

function checkImage(image, where) {
  const planned = libraryPhotos.some(([target]) => target === image);
  if (!planned && !imageExists.get(image)) problems.push(`${where}: нет фото ${image}`);
}

function bodyImages(body) {
  return [...body.matchAll(/^!\[[^\]]*\]\(([^)\s]+)\)$/gm)].map((match) => match[1]);
}

function planArticle(meta) {
  const body = fs.readFileSync(path.join(CONTENT_DIR, `${meta.slug}.md`), "utf8").trim();
  for (const match of body.matchAll(/^\{\{\s*товар\s*:\s*([a-z0-9-]+)\s*\}\}$/gm)) {
    if (!productExists.get(match[1])) problems.push(`${meta.slug}: нет товара ${match[1]}`);
  }
  for (const match of body.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
    if (match[1].startsWith("/")) checkLink(match[1], meta.slug);
  }
  if (!body.includes("](/catalog/stekla-far/)")) problems.push(`${meta.slug}: нет ссылки на раздел стёкол`);
  const inline = bodyImages(body);
  for (const image of new Set([meta.cover, ...inline])) checkImage(image, meta.slug);

  const data = {
    slug: meta.slug,
    title: meta.title,
    excerpt: meta.excerpt,
    body,
    cover: meta.cover,
    images: [...new Set([meta.cover, ...inline])],
    seoTitle: meta.seoTitle,
    seoDescription: meta.seoDescription,
    faq: meta.faq,
    topic: meta.topic,
    keyword: meta.keyword,
  };
  if (data.seoDescription.length > 165) problems.push(`${meta.slug}: описание для поиска ${data.seoDescription.length} знаков`);

  const existing = readArticle.get(meta.slug);
  if (existing && !overwrite) {
    say(`статья ${meta.slug}: уже есть (${existing.status}), не трогаю — перезаписать можно с --overwrite`);
    return null;
  }
  if (existing && existing.data === JSON.stringify(data)) {
    say(`статья ${meta.slug}: без изменений`);
    return null;
  }
  const words = body.split(/\s+/).length;
  say(`статья ${meta.slug}: ${existing ? "перезапись" : "новая"}, ${words} слов, ${body.length} знаков, вопросов ${meta.faq.length}`);
  return { id: existing?.id ?? null, data };
}

function planCategory() {
  const spec = CONTENT.category;
  const row = readCategory.get(spec.slug);
  if (!row) throw new Error(`нет раздела ${spec.slug}`);
  const data = JSON.parse(row.data);
  const original = row.data;

  for (const [field, value] of Object.entries(spec.set)) {
    if (data[field] === value) continue;
    say(`раздел ${spec.slug}: ${field}\n    было: ${data[field] ?? "—"}\n    стало: ${value}`);
    data[field] = value;
  }
  for (const [from, to] of spec.replaceInDescription) {
    if (data.description?.includes(to)) continue;
    if (!data.description?.includes(from)) {
      problems.push(`раздел ${spec.slug}: в описании не найдено «${from}»`);
      continue;
    }
    data.description = data.description.replace(from, to);
    say(`раздел ${spec.slug}: описание — «${from}» → «${to}»`);
  }
  for (const [question, answer] of Object.entries(spec.faqAnswers)) {
    const item = (data.faq ?? []).find((entry) => entry.q === question);
    if (!item) {
      problems.push(`раздел ${spec.slug}: нет вопроса «${question}»`);
      continue;
    }
    if (item.a === answer) continue;
    say(`раздел ${spec.slug}: ответ на «${question}»\n    было: ${item.a}\n    стало: ${answer}`);
    item.a = answer;
  }
  return JSON.stringify(data) === original ? null : { id: row.id, data };
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
const articles = CONTENT.articles.map(planArticle).filter(Boolean);

if (problems.length) {
  console.log(`\nОшибки:\n${problems.map((line) => `- ${line}`).join("\n")}`);
  process.exit(1);
}

if (!apply) {
  console.log(`\nПроверка: раздел ${category ? "меняется" : "без изменений"}, статей к записи ${articles.length}, новых фото ${libraryPhotos.length}. Ничего не записано — запустите с --apply.`);
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupFile = path.join(BACKUP_DIR, `shop-before-seo-glass-${now}.db`);
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
  articles.forEach((article, index) => {
    const publishedAt = now + index;
    if (article.id) {
      updateArticle.run(article.data.title, JSON.stringify(article.data), now, publishedAt, article.id);
    } else {
      insertArticle.run(article.data.slug, article.data.title, JSON.stringify(article.data), now, now, publishedAt);
    }
  });
  if (category) bump.run("counter:catalog");
  if (articles.length) bump.run("counter:articles");
  if (photos.length) bump.run("counter:images");
})();

await revalidate();

const reportFile = path.join(ROOT, "var", `seo-glass-${now}.txt`);
fs.writeFileSync(reportFile, `${log.join("\n")}\n`);
console.log(`\nГотово: раздел ${category ? "обновлён" : "без изменений"}, статей ${articles.length}. Отчёт: ${path.relative(ROOT, reportFile)}`);
