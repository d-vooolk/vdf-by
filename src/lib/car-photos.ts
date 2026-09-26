import fsp from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { years } from "./car-types";
import { getDb } from "./db";
import { processImage, removeImageFiles } from "./image-pipeline.mjs";
import { largestVariantUrl, pickUrl, type ImageEntry } from "./image-types";
import { deleteImage, getImage, saveImage } from "./images";

const PUBLIC_DIR = path.join(process.cwd(), "public");

export interface GenerationInfo {
  id: string;
  markId: string;
  modelId: string;
  markName: string;
  modelName: string;
  generationName: string;
  yearFrom: number | null;
  yearTo: number | null;
}

export interface CarFrontPhoto {
  generationId: string;
  image: string;
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  createdAt: number;
}

export interface CreditedPhoto extends CarFrontPhoto {
  car: string;
}

export interface PhotoCredit {
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
}

interface PhotoRow {
  generation_id: string;
  image: string;
  title: string;
  author: string;
  license: string;
  license_url: string;
  source_url: string;
  created_at: number;
}

function toPhoto(row: PhotoRow): CarFrontPhoto {
  return {
    generationId: row.generation_id,
    image: row.image,
    title: row.title,
    author: row.author,
    license: row.license,
    licenseUrl: row.license_url,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
  };
}

export function getGenerationInfo(generationId: string): GenerationInfo | null {
  const row = getDb()
    .prepare(
      `SELECT g.id, k.id AS markId, m.id AS modelId, k.name AS markName, m.name AS modelName, g.name AS generationName,
              g.year_from AS yearFrom, g.year_to AS yearTo
         FROM car_generations g
         JOIN car_models m ON m.id = g.model_id
         JOIN car_marks  k ON k.id = m.mark_id
        WHERE g.id = ?`,
    )
    .get(generationId) as GenerationInfo | undefined;
  return row ?? null;
}

function shortModelName(info: GenerationInfo): string {
  const model = info.modelName.trim();
  return model.toLowerCase().startsWith(info.markName.toLowerCase())
    ? model.slice(info.markName.length).trim()
    : model;
}

export function composerLabel(info: GenerationInfo, now: number): string {
  const period = years(info, now);
  return [`Для ${info.markName}`, shortModelName(info), info.generationName, period]
    .filter(Boolean)
    .join(" ");
}

function latinModel(name: string): string {
  return name
    .replace(/сери[ияй]/gi, "Series")
    .replace(/класс/gi, "Class")
    .replace(/[А-Яа-яЁё]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function commonsQueries(info: GenerationInfo): string[] {
  const base = `${info.markName} ${latinModel(shortModelName(info))}`.trim();
  const codes = info.generationName.match(/\(([^)]+)\)/)?.[1] ?? "";
  const bodyCode = codes.split(/[/,]/)[0]?.trim() ?? "";
  const numeral = info.generationName.match(/^[IVX]+\b/)?.[0] ?? "";
  const facelift = /рестайлинг/i.test(info.generationName) ? " facelift" : "";

  const queries = [
    bodyCode && `${base} ${bodyCode}${facelift} front`,
    bodyCode && `${base} ${bodyCode}`,
    numeral && `${base} ${numeral}${facelift} front`,
    info.yearFrom && `${base} ${info.yearFrom} front`,
    `${base} front`,
  ].filter((query): query is string => Boolean(query));

  return [...new Set(queries)];
}

export function getCarFrontPhoto(generationId: string): CarFrontPhoto | null {
  const row = getDb()
    .prepare("SELECT * FROM car_front_photos WHERE generation_id = ?")
    .get(generationId) as PhotoRow | undefined;
  return row ? toPhoto(row) : null;
}

export function listCreditedPhotos(): CreditedPhoto[] {
  const rows = getDb()
    .prepare(
      `SELECT p.*, k.name AS markName, m.name AS modelName, g.name AS generationName
         FROM car_front_photos p
         JOIN car_generations g ON g.id = p.generation_id
         JOIN car_models m ON m.id = g.model_id
         JOIN car_marks  k ON k.id = m.mark_id
        WHERE p.source_url <> ''
        ORDER BY k.name, m.name, g.year_from`,
    )
    .all() as Array<PhotoRow & { markName: string; modelName: string; generationName: string }>;

  return rows.map((row) => ({
    ...toPhoto(row),
    car: [row.markName, row.modelName, row.generationName].join(" "),
  }));
}

async function dropImage(imagePath: string): Promise<void> {
  const entry = getImage(imagePath);
  if (entry) await removeImageFiles(entry, PUBLIC_DIR);
  deleteImage(imagePath);
}

export async function saveCarFrontPhoto(
  generationId: string,
  source: Buffer,
  credit: PhotoCredit,
): Promise<CarFrontPhoto> {
  const stamp = Date.now().toString(36);
  const relativePath = `cars/front/${generationId}-${stamp}.jpg`;
  const result = await processImage({
    source,
    relativePath,
    outDir: path.join(PUBLIC_DIR, "img"),
    sharp,
  });
  if (!result) throw new Error("Файл не похож на картинку");
  saveImage(relativePath, result.entry as ImageEntry, result.bytes);

  const previous = getCarFrontPhoto(generationId);
  const createdAt = Date.now();
  getDb()
    .prepare(
      `INSERT INTO car_front_photos
         (generation_id, image, title, author, license, license_url, source_url, created_at)
       VALUES (@generationId, @image, @title, @author, @license, @licenseUrl, @sourceUrl, @createdAt)
       ON CONFLICT(generation_id) DO UPDATE SET
         image = @image, title = @title, author = @author, license = @license,
         license_url = @licenseUrl, source_url = @sourceUrl, created_at = @createdAt`,
    )
    .run({ generationId, image: relativePath, ...credit, createdAt });

  if (previous && previous.image !== relativePath) await dropImage(previous.image);

  return { generationId, image: relativePath, ...credit, createdAt };
}

export async function deleteCarFrontPhoto(generationId: string): Promise<void> {
  const previous = getCarFrontPhoto(generationId);
  if (!previous) return;
  getDb().prepare("DELETE FROM car_front_photos WHERE generation_id = ?").run(generationId);
  await dropImage(previous.image);
}

export async function readCarFrontPhoto(photo: CarFrontPhoto): Promise<Buffer> {
  const url = largestVariantUrl(getImage(photo.image));
  if (!url) throw new Error("Файлы фото автомобиля не найдены — загрузите его заново");
  return fsp.readFile(path.join(PUBLIC_DIR, url.replace(/^\//, "")));
}

export function describeCarPhoto(photo: CarFrontPhoto | null) {
  if (!photo) return null;
  return {
    thumb: pickUrl(getImage(photo.image), 800),
    title: photo.title,
    author: photo.author,
    license: photo.license,
    licenseUrl: photo.licenseUrl,
    sourceUrl: photo.sourceUrl,
  };
}
