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
const writeProduct = db.prepare("UPDATE products SET title = ?, data = ?, updated_at = ? WHERE id = ?");
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
const ARTICLE_FIELDS = ["slug", "title", "excerpt", "body", "cover", "images", "seoTitle", "seoDescription", "faq", "topic", "notes", "keyword"];
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
    const item = (data.faq ?? []).find((entry) => entry.a.includes(from));
    if (!item) {
      if (!(data.faq ?? []).some((entry) => entry.a.includes(to))) problems.push(`${where}: в ответах FAQ не найдено «${from}»`);
      continue;
    }
    item.a = item.a.replace(from, to);
    say(`${where}: ответ «${item.q}» — «${from}» → «${to}»`);
  }
  for (const [from, to] of spec.replaceInDescription ?? []) {
    if (!data.description?.includes(from)) {
      if (!data.description?.includes(to)) problems.push(`${where}: в описании не найдено «${from.trim()}»`);
      continue;
    }
    data.description = data.description.replace(from, to);
    say(`${where}: описание — «${from.trim()}» → «${to.trim() || "∅"}»`);
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
  for (const field of ["title", "seoTitle", "seoDescription", "excerpt"]) {
    if (spec[field] === undefined || data[field] === spec[field]) continue;
    say(`статья ${spec.slug}: ${field}\n    было: ${data[field] ?? "—"}\n    стало: ${spec[field]}`);
    data[field] = spec[field];
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
    `\nПроверка: товаров к записи ${products.length}, статей ${articles.length}, новых черновиков ${drafts.length}, к публикации ${publish.length}, настройки сайта ${site ? "меняются" : "без изменений"}. Ничего не записано — запустите с --apply.`,
  );
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupFile = path.join(BACKUP_DIR, `shop-before-seo-patch-${now}.db`);
await db.backup(backupFile);
say(`копия базы: ${path.relative(ROOT, backupFile)}`);

db.transaction(() => {
  for (const product of products) {
    if (product.data) writeProduct.run(product.title, JSON.stringify(product.data), now, product.id);
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
  for (const article of articles) writeArticle.run(article.data.title, JSON.stringify(article.data), now, article.id);
  for (const draft of drafts) insertDraft.run(draft.slug, draft.title, JSON.stringify(draft.data), now, now);
  if (site) writeSite.run(JSON.stringify(site));
  for (const slug of publish) publishArticle.run(now, now, slug);
  if (products.length || site) bump.run("counter:catalog");
  if (articles.length || drafts.length || publish.length) bump.run("counter:articles");
})();

await revalidate();

const reportFile = path.join(ROOT, "var", `seo-patch-${now}.txt`);
fs.writeFileSync(reportFile, `${log.join("\n")}\n`);
console.log(
  `\nГотово: товаров ${products.length}, статей ${articles.length}, новых черновиков ${drafts.length}, опубликовано ${publish.length}${site ? ", настройки сайта" : ""}. Отчёт: ${path.relative(ROOT, reportFile)}`,
);
