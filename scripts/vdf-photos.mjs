#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import sharp from "sharp";

import { env } from "../src/lib/env.mjs";
import { processImage, safeImagePath } from "../src/lib/image-pipeline.mjs";
import { openDatabase } from "../src/lib/migrations.mjs";

sharp.cache(false);
sharp.concurrency(2);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));
const BACKUP_DIR = env("BACKUP_DIR", path.join(ROOT, "var", "backups"));
const IMG_DIR = path.join(ROOT, "public", "img");
const REPORT_FILE = path.join(ROOT, "var", "vdf-photos-report.txt");
const DEFAULT_SLUGS = ["stekla-far", "svetovody"];
const VDF_HOST = /(^|\.)vdf-light\.ru$/i;

const MAX_IMAGES = 10;
const MAX_BYTES = 20 * 1024 * 1024;
const MIN_SIDE = 300;
const PARALLEL = 3;
const SAME_PICTURE_DISTANCE = 6;
const TIMEOUT_MS = 20000;
const PRODUCT_PAUSE_MS = 400;
const FORMAT_EXTENSION = { jpeg: "jpg", png: "png", webp: "webp", avif: "avif", heif: "avif" };
const SIDE_WORDS = /\s*[(,]?\s*(лев(ое|ая|ый|ой)|прав(ое|ая|ый|ой))\s*\)?\s*$/i;
const LEFT = "левое";
const RIGHT = "правое";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const apply = process.argv.includes("--apply");
const limit = Number(arg("limit")) || Infinity;
const slugs = (arg("slugs") ?? DEFAULT_SLUGS.join(","))
  .split(",")
  .map((slug) => slug.trim())
  .filter(Boolean);

const normalize = (title) => String(title ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
const withoutSide = (title) => String(title ?? "").replace(SIDE_WORDS, "").trim();
const sideOfWord = (word) => (/^лев/i.test(word) ? LEFT : /^прав/i.test(word) ? RIGHT : "");

const db = openDatabase(Database, DB_PATH);

const roots = db
  .prepare(`SELECT id, name, slug FROM categories WHERE slug IN (${slugs.map(() => "?").join(",")})`)
  .all(...slugs);
const missing = slugs.filter((slug) => !roots.some((category) => category.slug === slug));
if (missing.length) {
  console.error(`\nНет разделов с адресом: ${missing.join(", ")}\n`);
  process.exit(1);
}
const children = db
  .prepare(`SELECT id, name, slug FROM categories WHERE parent_id IN (${roots.map(() => "?").join(",")})`)
  .all(...roots.map((category) => category.id));
const categories = [...roots, ...children];
const categoryIds = categories.map((category) => category.id);

function readLinks(file) {
  const result = new Map();
  let title = "";
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const text = raw.trim();
    if (!text) continue;
    if (/^https?:\/\//i.test(text)) {
      if (title) result.get(title).push(text);
    } else {
      title = normalize(text);
      if (!result.has(title)) result.set(title, []);
    }
  }
  return result;
}

const links = arg("links") ? readLinks(arg("links")) : null;

const allProducts = db
  .prepare(
    `SELECT id, category_id, data FROM products WHERE category_id IN (${categoryIds.map(() => "?").join(",")})`,
  )
  .all(...categoryIds)
  .map((row) => ({ id: row.id, categoryId: row.category_id, data: JSON.parse(row.data) }));
const products = links
  ? allProducts.filter((product) => links.has(normalize(product.data.title)))
  : allProducts;
if (links) {
  const known = new Set(products.map((product) => normalize(product.data.title)));
  const unknown = [...links.keys()].filter((title) => !known.has(title));
  if (unknown.length) console.log(`В разделах нет товаров с названием:\n  ${unknown.join("\n  ")}\n`);
}

const cardsByUrl = new Map();
for (const row of db
  .prepare("SELECT url, card FROM vdf_export_items WHERE status = 'read' AND card IS NOT NULL ORDER BY export_id")
  .all()) {
  try {
    const card = JSON.parse(row.card);
    if (card?.title && Array.isArray(card.images)) cardsByUrl.set(row.url, { ...card, url: card.url || row.url });
  } catch {}
}

function sideOfCard(card) {
  if (card.side === LEFT || card.side === RIGHT) return card.side;
  const match = String(card.title).match(SIDE_WORDS);
  return match ? sideOfWord(match[1]) : "";
}

const byTitle = new Map();
const bySideTitle = new Map();
const push = (map, key, card) => {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(card);
};
for (const card of cardsByUrl.values()) {
  push(byTitle, normalize(card.title), card);
  const side = sideOfCard(card);
  if (side) push(bySideTitle, `${side}|${normalize(withoutSide(card.title))}`, card);
}

function single(cards) {
  if (!cards?.length) return { card: null, ambiguous: false };
  const withImages = cards.filter((card) => card.images.length);
  if (!withImages.length) return { card: null, ambiguous: false, noImages: true };
  const signature = (card) => card.images.join("\n");
  const first = withImages[0];
  const ambiguous = withImages.some((card) => signature(card) !== signature(first));
  return { card: ambiguous ? null : first, ambiguous, candidates: withImages };
}

function hasPhotos(product) {
  if (product.images?.length) return true;
  return (product.optionGroups ?? []).some((group) => (group.values ?? []).some((value) => value.images?.length));
}

function sideValues(product) {
  const values = [];
  for (const group of product.optionGroups ?? []) {
    for (const value of group.values ?? []) {
      const side = sideOfWord(normalize(value.label));
      if (side) values.push({ value, side });
    }
  }
  return values;
}

function linkedPlan(product, urls) {
  const assignments = [];
  const problems = [];
  for (const url of urls) {
    const card = cardsByUrl.get(url);
    if (!card) problems.push(`${url}: нет в выгрузках`);
    else if (!card.images.length) problems.push(`${url}: у карточки нет фото`);
    else assignments.push({ side: sideOfCard(card), card });
  }
  const sides = new Set(sideValues(product.data).map((item) => item.side));
  if (sides.size && assignments.every((assignment) => sides.has(assignment.side))) {
    if (!assignments.length) return { kind: "none", problems };
    return { kind: "pair", assignments, problems };
  }
  if (assignments.length === 1 && !sides.size) return { kind: "single", card: assignments[0].card };
  return { kind: "ambiguous", problems: [...problems, "стороны карточек не совпадают с вариантами товара"] };
}

function plan(product) {
  const title = normalize(product.data.title);
  if (links) return linkedPlan(product, links.get(title));
  const sides = [...new Set(sideValues(product.data).map((item) => item.side))];
  if (sides.length) {
    const assignments = [];
    const problems = [];
    for (const side of [LEFT, RIGHT].filter((item) => sides.includes(item))) {
      const found = single(bySideTitle.get(`${side}|${title}`));
      if (found.card) assignments.push({ side, card: found.card });
      else if (found.ambiguous) problems.push(`${side}: несколько разных карточек — ${found.candidates.map((card) => card.url).join(", ")}`);
      else problems.push(`${side}: карточка не нашлась`);
    }
    if (assignments.length) return { kind: "pair", assignments, problems };
    if (problems.some((problem) => problem.includes("несколько"))) return { kind: "ambiguous", problems };
  }
  const found = single(byTitle.get(title));
  if (found.card) return { kind: "single", card: found.card };
  if (found.ambiguous) return { kind: "ambiguous", problems: found.candidates.map((card) => card.url) };
  if (found.noImages) return { kind: "no-images" };
  return { kind: "none" };
}

const groups = { pair: [], single: [], ambiguous: [], "no-images": [], none: [], "has-photos": [] };
for (const product of products) {
  if (hasPhotos(product.data)) {
    groups["has-photos"].push({ product });
    continue;
  }
  const result = plan(product);
  groups[result.kind].push({ product, ...result });
}

const line = ({ product }) => `  ${product.data.title}  [${product.id}]`;
const report = [
  `Разделы: ${categories.map((category) => `${category.name} (${category.slug})`).join(", ")}`,
  `Карточек vdf-light в выгрузках: ${cardsByUrl.size}`,
  "",
  `Товары с вариантами левое/правое — фото обоих стёкол: ${groups.pair.length}`,
  ...groups.pair.flatMap((item) => [
    line(item),
    ...item.assignments.map((assignment) => `      ${assignment.side}  ←  ${assignment.card.url}`),
    ...item.problems.map((problem) => `      ! ${problem}`),
  ]),
  "",
  `Товары без вариантов сторон — совпало по названию: ${groups.single.length}`,
  ...groups.single.map((item) => `${line(item)}  ←  ${item.card.url}`),
  "",
  `Несколько разных карточек с таким же названием (пропущены): ${groups.ambiguous.length}`,
  ...groups.ambiguous.flatMap((item) => [line(item), ...item.problems.map((problem) => `      ${problem}`)]),
  "",
  `Совпало, но на vdf-light у карточки нет фото: ${groups["no-images"].length}`,
  ...groups["no-images"].map(line),
  "",
  `Не нашлось карточки с таким названием: ${groups.none.length}`,
  ...groups.none.map(line),
  "",
  `Уже есть фото (не трогаем): ${groups["has-photos"].length}`,
  ...groups["has-photos"].map(line),
].join("\n");
fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
fs.writeFileSync(REPORT_FILE, `${report}\n`);

const halfPairs = groups.pair.filter((item) => item.assignments.length < 2).length;
console.log(`Разделы: ${categories.map((category) => `${category.name} (${category.slug})`).join(", ")}`);
console.log(`Товаров в разделах: ${products.length}, карточек vdf-light в выгрузках: ${cardsByUrl.size}`);
console.log(`  получат фото: ${groups.single.length + groups.pair.length}`);
console.log(`    с вариантами левое/правое: ${groups.pair.length}${halfPairs ? ` (из них только одна сторона: ${halfPairs})` : ""}`);
console.log(`    без вариантов сторон: ${groups.single.length}`);
console.log(`  пропущены — несколько разных карточек с таким названием: ${groups.ambiguous.length}`);
console.log(`  пропущены — у карточки на vdf-light нет фото: ${groups["no-images"].length}`);
console.log(`  не нашлось карточки с таким названием: ${groups.none.length}`);
console.log(`  уже есть фото, не трогаем: ${groups["has-photos"].length}`);
console.log(`Полный список: ${path.relative(ROOT, REPORT_FILE)}`);

if (!cardsByUrl.size) {
  console.log("\nВ базе нет прочитанных выгрузок vdf-light — сначала сделайте выгрузку в админке.");
  process.exit(0);
}
if (!apply) {
  console.log("\nЭто пробный прогон. Поставить фото: node scripts/vdf-photos.mjs --apply");
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const backupFile = path.join(BACKUP_DIR, `shop-before-vdf-photos-${stamp}.db`);
await db.backup(backupFile);
console.log(`\nКопия базы: ${path.relative(ROOT, backupFile)}`);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fingerprint(source) {
  const pixels = await sharp(source).resize(8, 8, { fit: "fill" }).greyscale().raw().toBuffer();
  const average = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  let hash = 0n;
  for (const value of pixels) hash = (hash << 1n) | (value > average ? 1n : 0n);
  return hash;
}

function distance(a, b) {
  let diff = a ^ b;
  let count = 0;
  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

async function download(url, order, referer) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!VDF_HOST.test(parsed.hostname)) return null;
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5",
      Referer: referer,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return null;
  }
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) {
    await response.body?.cancel();
    return null;
  }
  const source = Buffer.from(await response.arrayBuffer());
  if (source.byteLength > MAX_BYTES) return null;
  const meta = await sharp(source).metadata().catch(() => null);
  const extension = meta?.format ? FORMAT_EXTENSION[meta.format] : undefined;
  if (!meta?.width || !meta.height || !extension) return null;
  if (Math.min(meta.width, meta.height) < MIN_SIDE) return null;
  return { order, url, source, extension, pixels: meta.width * meta.height, fingerprint: await fingerprint(source) };
}

function fileName(url, extension, index) {
  const base = path
    .basename(new URL(url).pathname)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\.(?:jpe?g|png|webp|avif)/gi, "")
    .replace(/[-_](?:\d{2,4}x\d{2,4}|\d{3,4})$/i, "");
  return `${base || `photo-${index + 1}`}.${extension}`;
}

const imageExists = db.prepare("SELECT 1 FROM images WHERE path = ?");
const insertImage = db.prepare(
  `INSERT INTO images (path, w, h, blur, sources, fallback, bytes, created_at)
   VALUES (@path, @w, @h, @blur, @sources, @fallback, @bytes, @createdAt)`,
);
const reserved = new Set();

function freePath(folder, name) {
  let relativePath = safeImagePath(folder, name);
  if (imageExists.get(relativePath) || reserved.has(relativePath)) {
    const extension = path.extname(relativePath);
    const base = relativePath.slice(0, -extension.length);
    let counter = 2;
    while (imageExists.get(`${base}-${counter}${extension}`) || reserved.has(`${base}-${counter}${extension}`)) {
      counter += 1;
    }
    relativePath = `${base}-${counter}${extension}`;
  }
  reserved.add(relativePath);
  return relativePath;
}

async function storeCardImages(card, folder) {
  const queue = card.images.slice(0, MAX_IMAGES * 2).map((url, order) => ({ url, order }));
  const downloaded = [];
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          const result = await download(job.url, job.order, card.url);
          if (result) downloaded.push(result);
        } catch {}
      }
    }),
  );

  const unique = [];
  for (const candidate of downloaded.sort((a, b) => a.order - b.order)) {
    const twin = unique.findIndex((kept) => distance(kept.fingerprint, candidate.fingerprint) <= SAME_PICTURE_DISTANCE);
    if (twin < 0) unique.push(candidate);
    else if (candidate.pixels > unique[twin].pixels) unique[twin] = { ...candidate, order: unique[twin].order };
  }

  const stored = [];
  for (const [index, picture] of unique.slice(0, MAX_IMAGES).entries()) {
    const relativePath = freePath(folder, fileName(picture.url, picture.extension, index));
    const result = await processImage({ source: picture.source, relativePath, outDir: IMG_DIR, sharp });
    if (result) stored.push({ path: relativePath, ...result });
  }
  return stored;
}

const bump = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, '1')
   ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
);
const readProduct = db.prepare("SELECT data FROM products WHERE id = ?");
const writeProduct = db.prepare("UPDATE products SET data = ?, updated_at = ? WHERE id = ?");

const work = [...groups.pair, ...groups.single].slice(0, limit);
let done = 0;
let failed = 0;
for (const [index, item] of work.entries()) {
  if (index > 0) await pause(PRODUCT_PAUSE_MS);
  const { product } = item;
  const folder = `${product.categoryId}/${product.id}`;
  const prefix = `[${index + 1}/${work.length}] ${product.data.title}`;
  try {
    const fresh = JSON.parse(readProduct.get(product.id).data);
    if (hasPhotos(fresh)) {
      console.log(`${prefix}: фото уже появились, пропускаю`);
      continue;
    }
    const stored = [];
    if (item.kind === "single") {
      const images = await storeCardImages(item.card, folder);
      stored.push(...images);
      fresh.images = images.map((image) => image.path);
    } else {
      const bySide = {};
      for (const { side, card } of item.assignments) {
        const images = await storeCardImages(card, side === RIGHT ? `${folder}/right` : folder);
        stored.push(...images);
        bySide[side] = images.map((image) => image.path);
      }
      for (const { value, side } of sideValues(fresh)) {
        if (bySide[side]?.length) value.images = bySide[side];
      }
      fresh.images = [...(bySide[LEFT] ?? []), ...(bySide[RIGHT] ?? [])];
    }
    if (!stored.length) {
      failed += 1;
      console.log(`${prefix}: фото не скачались или слишком мелкие`);
      continue;
    }
    const now = Date.now();
    db.transaction(() => {
      for (const image of stored) {
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
      writeProduct.run(JSON.stringify(fresh), now, product.id);
      bump.run("counter:catalog");
      bump.run("counter:images");
    })();
    done += 1;
    console.log(`${prefix}: ${stored.length} фото`);
  } catch (error) {
    failed += 1;
    console.log(`${prefix}: ошибка — ${error.message}`);
  }
}

console.log(`\nГотово: фото поставлены ${done} товарам, не получилось: ${failed}.`);
console.log("Пересоберите сайт, чтобы страницы показали новые фото: ./deploy/deploy.sh");
