import { bumpImagesVersion, getDb, imagesVersion } from "./db";
import type { ImageEntry, ImageMap } from "./image-types";

/**
 * Манифест обработанных фотографий.
 *
 * Раньше его собирал на сборке scripts/images.mjs и складывал в
 * src/generated/images.json. Теперь запись появляется в момент загрузки фото
 * через админку — сборка для этого больше не нужна.
 *
 * Сами файлы (avif/webp/jpeg во всех ширинах) по-прежнему лежат в
 * public/img/ и раздаются nginx напрямую. В базе — только размеры, размытая
 * заглушка и список ссылок.
 *
 * Модуль серверный. Клиентским компонентам манифест целиком не отдаём —
 * иначе он уедет в бандл; вместо этого страница передаёт им ровно нужные
 * записи (см. pickImages).
 */

interface ImageRow {
  path: string;
  w: number;
  h: number;
  blur: string;
  sources: string;
  fallback: string;
}

let cache: ImageMap | null = null;
let cachedVersion = -1;

function toEntry(row: ImageRow): ImageEntry {
  return {
    w: row.w,
    h: row.h,
    blur: row.blur,
    sources: JSON.parse(row.sources) as ImageEntry["sources"],
    fallback: row.fallback,
  };
}

function load(): ImageMap {
  const version = imagesVersion();
  if (cache && cachedVersion === version) return cache;

  const rows = getDb()
    .prepare("SELECT path, w, h, blur, sources, fallback FROM images")
    .all() as ImageRow[];

  const map: ImageMap = {};
  for (const row of rows) map[row.path] = toEntry(row);

  cache = map;
  cachedVersion = version;
  return map;
}

export function getImage(imagePath: string | undefined): ImageEntry | null {
  if (!imagePath) return null;
  return load()[imagePath] ?? null;
}

/**
 * Подмножество манифеста для передачи в клиентский компонент пропсом.
 *
 * Размытые заглушки выбрасываются: рисовать их перестали (см. Picture.tsx),
 * а весит каждая пару килобайт base64 — на товаре с галереей из десяти фото
 * это десятки килобайт в HTML страницы, которые никто не использует.
 */
export function pickImages(paths: string[]): ImageMap {
  const all = load();
  const map: ImageMap = {};
  for (const imagePath of paths) {
    const entry = all[imagePath];
    if (entry) map[imagePath] = { ...entry, blur: "" };
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Запись — для загрузки фото из админки                               */
/* ------------------------------------------------------------------ */

export interface StoredImage extends ImageEntry {
  path: string;
  bytes: number;
  createdAt: number;
}

/** Кладёт или заменяет запись о фотографии. Файлы пишет вызывающий код. */
export function saveImage(
  imagePath: string,
  entry: ImageEntry,
  bytes: number,
): void {
  getDb()
    .prepare(
      `INSERT INTO images (path, w, h, blur, sources, fallback, bytes, created_at)
       VALUES (@path, @w, @h, @blur, @sources, @fallback, @bytes, @createdAt)
       ON CONFLICT(path) DO UPDATE SET
         w = @w, h = @h, blur = @blur, sources = @sources,
         fallback = @fallback, bytes = @bytes, created_at = @createdAt`,
    )
    .run({
      path: imagePath,
      w: entry.w,
      h: entry.h,
      blur: entry.blur,
      sources: JSON.stringify(entry.sources),
      fallback: entry.fallback,
      bytes,
      createdAt: Date.now(),
    });
  bumpImagesVersion();
}

export function deleteImage(imagePath: string): void {
  getDb().prepare("DELETE FROM images WHERE path = ?").run(imagePath);
  bumpImagesVersion();
}

/** Все фотографии, новые сверху — для экрана выбора картинки в админке. */
export function listImages(): StoredImage[] {
  const rows = getDb()
    .prepare(
      `SELECT path, w, h, blur, sources, fallback, bytes, created_at
       FROM images ORDER BY created_at DESC, path`,
    )
    .all() as Array<ImageRow & { bytes: number; created_at: number }>;

  return rows.map((row) => ({
    path: row.path,
    ...toEntry(row),
    bytes: row.bytes,
    createdAt: row.created_at,
  }));
}

/**
 * Где используется фотография — проверка перед удалением.
 *
 * Ищем и в товарах (общая галерея или галерея опции), и в разделах: у раздела
 * тоже есть картинка, и забыть про неё значит получить заглушку на плитке
 * каталога.
 *
 * Поиск подстрокой по JSON, без нормализации в отдельную таблицу: товаров
 * сотни, а удаление фото — операция редкая.
 */
export function imageUsage(imagePath: string): string[] {
  const needle = `%"${imagePath}"%`;
  const db = getDb();

  const products = db
    .prepare("SELECT title FROM products WHERE data LIKE ? ORDER BY title LIMIT 20")
    .all(needle) as Array<{ title: string }>;

  const categories = db
    .prepare("SELECT name FROM categories WHERE data LIKE ? ORDER BY name LIMIT 20")
    .all(needle) as Array<{ name: string }>;

  const cars = db
    .prepare(
      `SELECT k.name || ' ' || m.name || ' ' || g.name AS name
         FROM car_front_photos p
         JOIN car_generations g ON g.id = p.generation_id
         JOIN car_models m ON m.id = g.model_id
         JOIN car_marks  k ON k.id = m.mark_id
        WHERE p.image = ?`,
    )
    .all(imagePath) as Array<{ name: string }>;

  return [
    ...products.map((row) => row.title),
    ...categories.map((row) => `раздел «${row.name}»`),
    ...cars.map((row) => `фото автомобиля для генератора: ${row.name}`),
  ];
}

const FRESH_MS = 24 * 60 * 60 * 1000;

function collectStrings(value: unknown, into: Set<string>): void {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, into);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, into);
  }
}

export function usedImagePaths(): Set<string> {
  const db = getDb();
  const used = new Set<string>();

  const jsonSources = [
    "SELECT data AS json FROM products",
    "SELECT data AS json FROM categories",
    "SELECT value AS json FROM settings",
  ];
  for (const sql of jsonSources) {
    for (const row of db.prepare(sql).all() as Array<{ json: string }>) {
      try {
        collectStrings(JSON.parse(row.json), used);
      } catch {
        used.add(row.json);
      }
    }
  }

  const columnSources = [
    "SELECT logo AS path FROM car_marks WHERE logo <> ''",
    "SELECT photo AS path FROM car_generations WHERE photo <> ''",
    "SELECT image AS path FROM car_front_photos",
  ];
  for (const sql of columnSources) {
    for (const row of db.prepare(sql).all() as Array<{ path: string }>) used.add(row.path);
  }

  return used;
}

export interface UnusedImages {
  images: StoredImage[];
  freshSkipped: number;
}

export function unusedImages(now = Date.now()): UnusedImages {
  const used = usedImagePaths();
  const unused = listImages().filter((image) => !used.has(image.path));
  const images = unused.filter((image) => now - image.createdAt >= FRESH_MS);
  return { images, freshSkipped: unused.length - images.length };
}
