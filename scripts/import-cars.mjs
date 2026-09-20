#!/usr/bin/env node
/**
 * Заливка справочника автомобилей из data/cars-catalog.json.
 *
 *   npm run import-cars
 *
 * Справочник — марки, модели и поколения с годами выпуска. Владелец магазина
 * его не правит: он привязывает к нему товары. Поэтому скрипт запускается
 * руками (и один раз на сервере после деплоя), а не перед каждой сборкой —
 * разбирать два мегабайта JSON на каждый npm run build незачем.
 *
 * Повторный запуск безопасен: строки обновляются по внешнему id из донора,
 * привязки товаров при этом не рвутся. Адреса страниц (slug) у уже
 * заведённых записей не трогаются никогда — они попадают в поиск, и молча
 * менять их нельзя.
 *
 * Фотографии поколений здесь не скачиваются: их девять с лишним тысяч, а
 * нужны единицы — фото забирается в момент, когда машину впервые привязали
 * к товару (см. src/lib/cars.ts).
 *
 * Логотипы марок — другое дело: их четыре сотни, они по паре килобайт, и
 * нужны все сразу. В списке марок машину находят глазами, по значку, и
 * список, где иконка есть у трёх марок из четырёхсот, выглядит сломанным.
 *
 *   npm run import-cars -- --logos
 *
 * Уже скачанные пропускаются, так что повторный запуск дешёвый.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import sharp from "sharp";

import { env } from "../src/lib/env.mjs";
import { processImage } from "../src/lib/image-pipeline.mjs";
import { openDatabase } from "../src/lib/migrations.mjs";
import { toSlug } from "../src/lib/slug.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "data", "cars-catalog.json");
const DB_PATH = env("DATABASE_PATH", path.join(ROOT, "var", "shop.db"));

if (!fs.existsSync(SOURCE)) {
  console.error(`\n[cars] Нет файла ${path.relative(ROOT, SOURCE)}\n`);
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
if (!Array.isArray(catalog.marks) || !catalog.marks.length) {
  console.error("\n[cars] В файле нет ни одной марки — похоже, он битый.\n");
  process.exit(1);
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = openDatabase(Database, DB_PATH);

/**
 * Свободный адрес в пределах набора уже занятых.
 *
 * Названия поколений повторяются сплошь и рядом («I», «II Рестайлинг»), а
 * адрес обязан быть один. Сначала пробуем год начала выпуска — он и
 * различает, и человеку понятен, — и только если и это занято, приписываем
 * номер.
 */
function freeSlug(taken, base, year) {
  const clean = base || "auto";
  if (!taken.has(clean)) return clean;
  if (year) {
    const withYear = `${clean}-${year}`;
    if (!taken.has(withYear)) return withYear;
  }
  for (let n = 2; ; n += 1) {
    const candidate = `${clean}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Донор отдаёт адреса без схемы: «avatars.mds.yandex.net/…». */
function fullUrl(value) {
  if (!value) return "";
  return /^https?:\/\//.test(value) ? value : `https://${value}`;
}

const markSlugTaken = new Set(
  db
    .prepare("SELECT slug FROM car_marks")
    .all()
    .map((row) => row.slug),
);

const existingMark = db.prepare("SELECT slug FROM car_marks WHERE id = ?");
const existingModel = db.prepare("SELECT slug FROM car_models WHERE id = ?");
const existingGeneration = db.prepare(
  "SELECT slug FROM car_generations WHERE id = ?",
);

const saveMark = db.prepare(
  `INSERT INTO car_marks (id, slug, name, year_from, year_to, logo_src)
   VALUES (@id, @slug, @name, @yearFrom, @yearTo, @logoSrc)
   ON CONFLICT(id) DO UPDATE SET
     name = @name, year_from = @yearFrom, year_to = @yearTo,
     logo_src = @logoSrc`,
);

const saveModel = db.prepare(
  `INSERT INTO car_models (id, mark_id, slug, name, year_from, year_to)
   VALUES (@id, @markId, @slug, @name, @yearFrom, @yearTo)
   ON CONFLICT(id) DO UPDATE SET
     mark_id = @markId, name = @name, year_from = @yearFrom, year_to = @yearTo`,
);

const saveGeneration = db.prepare(
  `INSERT INTO car_generations
     (id, model_id, slug, name, year_from, year_to, photo_src)
   VALUES (@id, @modelId, @slug, @name, @yearFrom, @yearTo, @photoSrc)
   ON CONFLICT(id) DO UPDATE SET
     model_id = @modelId, name = @name, year_from = @yearFrom,
     year_to = @yearTo, photo_src = @photoSrc`,
);

const counts = { marks: 0, models: 0, generations: 0 };

db.transaction(() => {
  for (const mark of catalog.marks) {
    const markId = String(mark.id);
    const known = existingMark.get(markId);
    const slug =
      known?.slug ?? freeSlug(markSlugTaken, toSlug(mark.name) || toSlug(markId));
    markSlugTaken.add(slug);

    saveMark.run({
      id: markId,
      slug,
      name: mark.name,
      yearFrom: mark.yearFrom ?? null,
      yearTo: mark.yearTo ?? null,
      logoSrc: fullUrl(mark.logo),
    });
    counts.marks += 1;

    const modelSlugTaken = new Set(
      db
        .prepare("SELECT slug FROM car_models WHERE mark_id = ?")
        .all(markId)
        .map((row) => row.slug),
    );

    for (const model of mark.models ?? []) {
      // Идентификаторы моделей уникальны только внутри марки: «300» есть и у
      // Chrysler, и у Mercedes-Benz.
      const modelId = `${markId}:${model.id}`;
      const knownModel = existingModel.get(modelId);
      const modelSlug =
        knownModel?.slug ??
        freeSlug(modelSlugTaken, toSlug(model.name) || toSlug(String(model.id)));
      modelSlugTaken.add(modelSlug);

      saveModel.run({
        id: modelId,
        markId,
        slug: modelSlug,
        name: model.name,
        yearFrom: model.yearFrom ?? null,
        yearTo: model.yearTo ?? null,
      });
      counts.models += 1;

      const generationSlugTaken = new Set(
        db
          .prepare("SELECT slug FROM car_generations WHERE model_id = ?")
          .all(modelId)
          .map((row) => row.slug),
      );

      for (const generation of model.generations ?? []) {
        const generationId = String(generation.id);
        const knownGeneration = existingGeneration.get(generationId);
        const generationSlug =
          knownGeneration?.slug ??
          freeSlug(
            generationSlugTaken,
            toSlug(generation.name) || toSlug(generationId),
            generation.yearFrom,
          );
        generationSlugTaken.add(generationSlug);

        saveGeneration.run({
          id: generationId,
          modelId,
          slug: generationSlug,
          name: generation.name,
          yearFrom: generation.yearFrom ?? null,
          yearTo: generation.yearTo ?? null,
          photoSrc: fullUrl(generation.photo),
        });
        counts.generations += 1;
      }
    }
  }
})();

console.log(
  `[cars] марок ${counts.marks}, моделей ${counts.models}, поколений ${counts.generations}`,
);

if (process.argv.includes("--logos")) await downloadLogos();

/**
 * Забирает логотипы всех марок к себе в public/img.
 *
 * Тем же конвейером, что и фотографии товаров, — иначе картинки пришлось бы
 * раздавать с чужого домена, а политика безопасности сайта этого не
 * разрешает (img-src 'self').
 *
 * Прозрачность заливается белым заранее: логотипы приходят png с альфой, и
 * jpeg-фолбэк из такого файла получился бы с чёрным фоном.
 */
async function downloadLogos() {
  const OUT_DIR = path.join(ROOT, "public", "img");

  const pending = db
    .prepare("SELECT id, slug, logo_src FROM car_marks WHERE logo = '' AND logo_src <> ''")
    .all();

  if (!pending.length) {
    console.log("[cars] логотипы уже на месте");
    return;
  }

  const saveImage = db.prepare(
    `INSERT INTO images (path, w, h, blur, sources, fallback, bytes, created_at)
     VALUES (@path, @w, @h, @blur, @sources, @fallback, @bytes, @createdAt)
     ON CONFLICT(path) DO UPDATE SET
       w = @w, h = @h, blur = @blur, sources = @sources,
       fallback = @fallback, bytes = @bytes, created_at = @createdAt`,
  );
  const setLogo = db.prepare("UPDATE car_marks SET logo = ? WHERE id = ?");

  let done = 0;
  let failed = 0;

  for (const mark of pending) {
    const relativePath = `cars/mark/${mark.slug}.jpg`;
    try {
      const response = await fetch(mark.logo_src, {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(String(response.status));

      const source = await sharp(Buffer.from(await response.arrayBuffer()))
        .flatten({ background: "#ffffff" })
        .png()
        .toBuffer();

      const result = await processImage({
        source,
        relativePath,
        outDir: OUT_DIR,
        sharp,
      });
      if (!result) throw new Error("не картинка");

      saveImage.run({
        path: relativePath,
        w: result.entry.w,
        h: result.entry.h,
        blur: result.entry.blur,
        sources: JSON.stringify(result.entry.sources),
        fallback: result.entry.fallback,
        bytes: result.bytes,
        createdAt: Date.now(),
      });
      setLogo.run(relativePath, mark.id);
      done += 1;
    } catch {
      // Не скачался один логотип — на его месте будет заглушка. Ронять из-за
      // этого заливку всего справочника незачем.
      failed += 1;
    }
  }

  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('counter:images', '1')
     ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
  ).run();

  console.log(`[cars] логотипов скачано ${done}, не вышло ${failed}`);
}
