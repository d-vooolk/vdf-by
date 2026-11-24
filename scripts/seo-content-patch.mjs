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

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const contentFile = arg("content");
if (!contentFile) {
  console.error("Укажите файл правок: --content scripts/seo-2026-10-26.json");
  process.exit(1);
}
const CONTENT = JSON.parse(fs.readFileSync(path.resolve(ROOT, contentFile), "utf8"));
const apply = process.argv.includes("--apply");
const port = arg("port", env("PORT", "3011"));

const db = openDatabase(Database, DB_PATH);
const now = Date.now();
const problems = [];
const log = [];
const say = (line) => {
  log.push(line);
  console.log(line);
};

const readProduct = db.prepare("SELECT id, title, data FROM products WHERE slug = ?");
const writeProduct = db.prepare(
  "UPDATE products SET title = ?, category_id = ?, brand = ?, data = ?, updated_at = ? WHERE id = ?",
);
const categoryExists = db.prepare("SELECT 1 FROM categories WHERE id = ?");
const writeProductSlug = db.prepare("UPDATE products SET slug = ? WHERE id = ?");
const slugTaken = db.prepare("SELECT 1 FROM products WHERE slug = ?");
const writeRedirect = db.prepare(
  `INSERT INTO redirects (from_path, to_path, created_at) VALUES (?, ?, ?)
   ON CONFLICT(from_path) DO UPDATE SET to_path = excluded.to_path, created_at = excluded.created_at`,
);
const retargetRedirects = db.prepare("UPDATE redirects SET to_path = ? WHERE to_path = ?");
const dropRedirect = db.prepare("DELETE FROM redirects WHERE from_path = ?");
const readArticle = db.prepare("SELECT id, title, data FROM articles WHERE slug = ?");
const insertDraft = db.prepare(
  `INSERT INTO articles (slug, title, status, data, created_at, updated_at, published_at)
   VALUES (?, ?, 'draft', ?, ?, ?, NULL)`,
);
const readArticleStatus = db.prepare("SELECT status FROM articles WHERE slug = ?");
const publishArticle = db.prepare(
  `UPDATE articles SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ?
   WHERE slug = ? AND status = 'draft'`,
);
const readSite = db.prepare("SELECT value FROM settings WHERE key = 'site'");
const writeSite = db.prepare("UPDATE settings SET value = ? WHERE key = 'site'");
const ARTICLE_FIELDS = ["slug", "title", "excerpt", "body", "cover", "images", "seoTitle", "seoDescription", "faq", "leadProducts", "topic", "notes", "keyword", "section"];
const imageExists = db.prepare("SELECT 1 FROM images WHERE path = ?");
const insertImage = db.prepare(
  `INSERT INTO images (path, w, h, blur, sources, fallback, bytes, created_at)
   VALUES (@path, @w, @h, @blur, @sources, @fallback, @bytes, @createdAt)`,
);
const coverImports = [];
const writeArticle = db.prepare("UPDATE articles SET title = ?, data = ?, updated_at = ? WHERE id = ?");
const findGeneration = db.prepare(
  `SELECT g.id FROM car_generations g
     JOIN car_models m ON m.id = g.model_id
     JOIN car_marks k ON k.id = m.mark_id
    WHERE k.slug = ? AND m.slug = ? AND g.slug = ?`,
);
const hasCar = db.prepare("SELECT 1 FROM product_cars WHERE product_id = ? AND generation_id = ?");
const removeCar = db.prepare("DELETE FROM product_cars WHERE product_id = ? AND generation_id = ?");
const addCar = db.prepare("INSERT OR IGNORE INTO product_cars (product_id, generation_id) VALUES (?, ?)");
const bump = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, '1')
   ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
);

function generationId(carPath, where) {
  const [mark, model, generation] = carPath.split("/");
  const row = findGeneration.get(mark, model, generation);
  if (!row) problems.push(`${where}: нет поколения ${carPath}`);
  return row?.id;
}

function applyFields(data, spec, where) {
  for (const [field, value] of Object.entries(spec.set ?? {})) {
    if (data[field] === value) continue;
    say(`${where}: ${field}\n    было: ${data[field] ?? "—"}\n    стало: ${value}`);
    data[field] = value;
  }
  for (const [name, value] of Object.entries(spec.specs ?? {})) {
    data.specs ??= [];
    const existing = data.specs.find((entry) => entry.name === name);
    if (existing?.value === value) continue;
    say(`${where}: характеристика «${name}» — ${existing?.value ?? "—"} → ${value}`);
    if (existing) existing.value = value;
    else data.specs.push({ name, value });
  }
  for (const [from, to] of spec.replaceInFaq ?? []) {
    const items = (data.faq ?? []).filter((entry) => entry.q.includes(from) || entry.a.includes(from));
    if (!items.length) {
      if (!(data.faq ?? []).some((entry) => entry.q.includes(to) || entry.a.includes(to))) {
        problems.push(`${where}: в FAQ не найдено «${from}»`);
      }
      continue;
    }
    for (const item of items) {
      item.q = item.q.replaceAll(from, to);
      item.a = item.a.replaceAll(from, to);
      say(`${where}: FAQ «${item.q}» — «${from}» → «${to}»`);
    }
  }
  for (const [from, to] of spec.replaceInDescription ?? []) {
    if (!data.description?.includes(from)) {
      if (!data.description?.includes(to)) problems.push(`${where}: в описании не найдено «${from.trim()}»`);
      continue;
    }
    data.description = data.description.replaceAll(from, to);
    say(`${where}: описание — «${from.trim()}» → «${to.trim() || "∅"}»`);
  }
  for (const question of spec.removeFaq ?? []) {
    const before = data.faq?.length ?? 0;
    data.faq = (data.faq ?? []).filter((entry) => entry.q !== question);
    if (data.faq.length !== before) say(`${where}: убран вопрос FAQ «${question}»`);
  }
  if (spec.fixFaqQuestions) {
    for (const item of data.faq ?? []) {
      const trimmed = item.q.trim();
      const fixed = `${trimmed[0].toUpperCase()}${trimmed.slice(1)}${trimmed.endsWith("?") ? "" : "?"}`;
      if (fixed === item.q) continue;
      say(`${where}: вопрос FAQ — «${item.q}» → «${fixed}»`);
      item.q = fixed;
    }
  }
  for (const [from, to] of spec.optionLabels ?? []) {
    const values = (data.optionGroups ?? []).flatMap((group) => group.values).filter((value) => value.label === from);
    if (!values.length) {
      const done = (data.optionGroups ?? []).some((group) => group.values.some((value) => value.label === to));
      if (!done) problems.push(`${where}: нет опции «${from}»`);
      continue;
    }
    for (const value of values) value.label = to;
    say(`${where}: опция «${from}» → «${to}»`);
  }
  if (spec.specsOrder) {
    const rank = (name) => {
      const index = spec.specsOrder.indexOf(name);
      return index < 0 ? spec.specsOrder.length : index;
    };
    const sorted = [...(data.specs ?? [])].sort((a, b) => rank(a.name) - rank(b.name));
    if (sorted.some((entry, index) => entry !== data.specs[index])) {
      data.specs = sorted;
      say(`${where}: порядок характеристик — ${sorted.map((entry) => entry.name).join(", ")}`);
    }
  }
  for (const name of spec.removeSpecs ?? []) {
    const before = data.specs?.length ?? 0;
    data.specs = (data.specs ?? []).filter((entry) => entry.name !== name);
    if (data.specs.length !== before) say(`${where}: убрана характеристика «${name}»`);
  }
}

function planProduct(spec) {
  const row = readProduct.get(spec.slug);
  if (!row) {
    problems.push(`нет товара ${spec.slug}`);
    return null;
  }
  const data = JSON.parse(row.data);
  applyFields(data, spec, spec.slug);
  if (data.categoryId && !categoryExists.get(data.categoryId)) problems.push(`${spec.slug}: нет раздела ${data.categoryId}`);
  if (data.seoTitle && data.seoTitle.length > 70) problems.push(`${spec.slug}: title ${data.seoTitle.length} знаков`);
  let newSlug = null;
  if (spec.newSlug && spec.newSlug !== spec.slug) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(spec.newSlug)) problems.push(`${spec.slug}: недопустимый адрес ${spec.newSlug}`);
    else if (slugTaken.get(spec.newSlug)) problems.push(`${spec.slug}: адрес ${spec.newSlug} уже занят`);
    else {
      newSlug = spec.newSlug;
      if ("slug" in data) data.slug = newSlug;
      say(`${spec.slug}: адрес → /product/${newSlug}/ (с переадресацией 308)`);
    }
  }

  const cars = { remove: [], add: [] };
  for (const carPath of spec.cars?.remove ?? []) {
    const id = generationId(carPath, spec.slug);
    if (id && hasCar.get(row.id, id)) {
      cars.remove.push(id);
      say(`${spec.slug}: убрать привязку ${carPath}`);
    }
  }
  for (const carPath of spec.cars?.add ?? []) {
    const id = generationId(carPath, spec.slug);
    if (id && !hasCar.get(row.id, id)) {
      cars.add.push(id);
      say(`${spec.slug}: добавить привязку ${carPath}`);
    }
  }

  const changed = JSON.stringify(data) !== row.data;
  if (!changed && !newSlug && !cars.remove.length && !cars.add.length) return null;
  return { id: row.id, slug: spec.slug, newSlug, title: data.title, data: changed ? data : null, cars };
}

function planArticle(spec) {
  const row = readArticle.get(spec.slug);
  if (!row) {
    problems.push(`нет статьи ${spec.slug}`);
    return null;
  }
  const data = JSON.parse(row.data);
  for (const field of ["title", "seoTitle", "seoDescription", "excerpt", "section"]) {
    if (spec[field] === undefined || data[field] === spec[field]) continue;
    say(`статья ${spec.slug}: ${field}\n    было: ${data[field] ?? "—"}\n    стало: ${spec[field]}`);
    data[field] = spec[field];
  }
  if (spec.leadProducts && JSON.stringify(data.leadProducts ?? []) !== JSON.stringify(spec.leadProducts)) {
    const missing = spec.leadProducts.filter((slug) => !readProduct.get(slug));
    if (missing.length) problems.push(`статья ${spec.slug}: нет товаров ${missing.join(", ")}`);
    say(`статья ${spec.slug}: товары под вводным абзацем\n    было: ${(data.leadProducts ?? []).join(", ") || "—"}\n    стало: ${spec.leadProducts.join(", ")}`);
    data.leadProducts = spec.leadProducts;
  }
  for (const [from, to] of spec.replaceInBody ?? []) {
    if (data.body?.includes(to)) continue;
    if (!data.body?.includes(from)) {
      problems.push(`статья ${spec.slug}: в тексте не найдено «${from.trim()}»`);
      continue;
    }
    data.body = data.body.replace(from, to);
    say(`статья ${spec.slug}: текст — «${from.trim()}» → «${to.trim()}»`);
  }
  if (spec.cover && spec.cover !== data.cover) {
    if (spec.coverSource) {
      const source = path.resolve(ROOT, spec.coverSource);
      if (!fs.existsSync(source)) problems.push(`статья ${spec.slug}: нет файла обложки ${spec.coverSource}`);
      else if (!imageExists.get(spec.cover)) coverImports.push({ path: spec.cover, source });
    } else if (!imageExists.get(spec.cover)) {
      problems.push(`статья ${spec.slug}: нет фото ${spec.cover}`);
    }
    say(`статья ${spec.slug}: обложка\n    было: ${data.cover ?? "—"}\n    стало: ${spec.cover}`);
    data.cover = spec.cover;
    if (!(data.images ?? []).includes(spec.cover)) data.images = [spec.cover, ...(data.images ?? [])];
  }
  for (const entry of spec.addFaq ?? []) {
    if ((data.faq ?? []).some((existing) => existing.q === entry.q)) continue;
    data.faq = [...(data.faq ?? []), entry];
    say(`статья ${spec.slug}: вопрос FAQ — «${entry.q}»`);
  }
  if (data.seoDescription && data.seoDescription.length > 165) {
    problems.push(`статья ${spec.slug}: описание для поиска ${data.seoDescription.length} знаков`);
  }
  return JSON.stringify(data) === row.data ? null : { id: row.id, data };
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

function planSite() {
  if (!CONTENT.site) return null;
  const row = readSite.get();
  if (!row) {
    problems.push("нет настроек сайта");
    return null;
  }
  const data = JSON.parse(row.value);
  for (const [field, value] of Object.entries(CONTENT.site)) {
    if (JSON.stringify(data[field] ?? null) === JSON.stringify(value)) continue;
    say(`настройки сайта: ${field}\n    было: ${JSON.stringify(data[field] ?? null)}\n    стало: ${JSON.stringify(value)}`);
    data[field] = value;
  }
  if (data.description && data.description.length > 165) {
    problems.push(`описание магазина ${data.description.length} знаков`);
  }
  return JSON.stringify(data) === row.value ? null : data;
}

function planDraft(spec) {
  if (readArticle.get(spec.slug)) {
    say(`статья ${spec.slug} уже есть — черновик не создаю`);
    return null;
  }
  for (const field of ["slug", "title", "body"]) {
    if (!spec[field]) problems.push(`черновик ${spec.slug ?? "?"}: нет поля ${field}`);
  }
  const unknown = Object.keys(spec).filter((field) => !ARTICLE_FIELDS.includes(field));
  if (unknown.length) problems.push(`черновик ${spec.slug}: лишние поля ${unknown.join(", ")}`);
  if (spec.seoTitle && spec.seoTitle.length > 70) problems.push(`черновик ${spec.slug}: title ${spec.seoTitle.length} знаков`);
  if (spec.seoDescription && spec.seoDescription.length > 165) {
    problems.push(`черновик ${spec.slug}: описание для поиска ${spec.seoDescription.length} знаков`);
  }
  say(`новый черновик статьи ${spec.slug}: ${spec.title}`);
  return { slug: spec.slug, title: spec.title, data: { images: [], faq: [], ...spec } };
}

const productBySlug = db.prepare("SELECT 1 FROM products WHERE slug = ?");
const readRedirect = db.prepare("SELECT to_path FROM redirects WHERE from_path = ?");
const redirects = (CONTENT.redirects ?? []).filter(([fromSlug, toSlug]) => {
  if (productBySlug.get(fromSlug)) {
    problems.push(`переадресация с /product/${fromSlug}/: товар с этим адресом есть`);
    return false;
  }
  if (!productBySlug.get(toSlug)) {
    problems.push(`переадресация на /product/${toSlug}/: товара нет`);
    return false;
  }
  if (readRedirect.get(`/product/${fromSlug}/`)?.to_path === `/product/${toSlug}/`) return false;
  say(`переадресация /product/${fromSlug}/ → /product/${toSlug}/`);
  return true;
});
const products = (CONTENT.products ?? []).map(planProduct).filter(Boolean);
const articles = (CONTENT.articles ?? []).map(planArticle).filter(Boolean);
const drafts = (CONTENT.drafts ?? []).map(planDraft).filter(Boolean);
const site = planSite();
const publish = (CONTENT.publish ?? []).filter((slug) => {
  const row = readArticleStatus.get(slug);
  if (!row) problems.push(`нет статьи ${slug} для публикации`);
  else if (row.status === "published") say(`статья ${slug} уже опубликована`);
  else say(`публикация статьи ${slug}`);
  return row?.status === "draft";
});

if (problems.length) {
  console.log(`\nОшибки:\n${problems.map((line) => `- ${line}`).join("\n")}`);
  process.exit(1);
}

if (!apply) {
  console.log(
    `\nПроверка: переадресаций ${redirects.length}, товаров к записи ${products.length}, статей ${articles.length}, новых черновиков ${drafts.length}, к публикации ${publish.length}, настройки сайта ${site ? "меняются" : "без изменений"}. Ничего не записано — запустите с --apply.`,
  );
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupFile = path.join(BACKUP_DIR, `shop-before-seo-patch-${now}.db`);
await db.backup(backupFile);
say(`копия базы: ${path.relative(ROOT, backupFile)}`);

sharp.cache(false);
const covers = [];
for (const cover of coverImports) {
  const result = await processImage({ source: cover.source, relativePath: cover.path, outDir: IMG_DIR, sharp });
  if (!result) throw new Error(`не картинка: ${cover.source}`);
  covers.push({ path: cover.path, ...result });
}

db.transaction(() => {
  for (const cover of covers) {
    insertImage.run({
      path: cover.path,
      w: cover.entry.w,
      h: cover.entry.h,
      blur: cover.entry.blur,
      sources: JSON.stringify(cover.entry.sources),
      fallback: cover.entry.fallback,
      bytes: cover.bytes,
      createdAt: now,
    });
  }
  for (const product of products) {
    if (product.data) {
      writeProduct.run(
        product.title,
        product.data.categoryId,
        product.data.brand ?? "",
        JSON.stringify(product.data),
        now,
        product.id,
      );
    }
    if (product.newSlug) {
      const from = `/product/${product.slug}/`;
      const to = `/product/${product.newSlug}/`;
      writeProductSlug.run(product.newSlug, product.id);
      dropRedirect.run(to);
      retargetRedirects.run(to, from);
      writeRedirect.run(from, to, now);
    }
    for (const id of product.cars.remove) removeCar.run(product.id, id);
    for (const id of product.cars.add) addCar.run(product.id, id);
  }
  for (const [fromSlug, toSlug] of redirects) writeRedirect.run(`/product/${fromSlug}/`, `/product/${toSlug}/`, now);
  for (const article of articles) writeArticle.run(article.data.title, JSON.stringify(article.data), now, article.id);
  for (const draft of drafts) insertDraft.run(draft.slug, draft.title, JSON.stringify(draft.data), now, now);
  if (site) writeSite.run(JSON.stringify(site));
  for (const slug of publish) publishArticle.run(now, now, slug);
  if (products.length || site || redirects.length) bump.run("counter:catalog");
  if (articles.length || drafts.length || publish.length) bump.run("counter:articles");
  if (covers.length) bump.run("counter:images");
})();

await revalidate();

const reportFile = path.join(ROOT, "var", `seo-patch-${now}.txt`);
fs.writeFileSync(reportFile, `${log.join("\n")}\n`);
console.log(
  `\nГотово: переадресаций ${redirects.length}, товаров ${products.length}, статей ${articles.length}, новых черновиков ${drafts.length}, опубликовано ${publish.length}${site ? ", настройки сайта" : ""}. Отчёт: ${path.relative(ROOT, reportFile)}`,
);
