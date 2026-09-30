import path from "node:path";

import { getProductCars } from "./cars";
import {
  composerLabel,
  ensureCarFrontPhoto,
  getGenerationInfo,
  readCarFrontPhoto,
} from "./car-photos";
import { bumpCatalogVersion, getDb } from "./db";
import { exclusive } from "./frame-lock";
import { framePhotoJpeg, framePhotoPath, isFramePhoto, withFramePhoto } from "./frame-photo.mjs";
import { frameComposerSettings, getFrameType, readFrameImage } from "./frame-types";
import { removeImageFiles } from "./image-pipeline.mjs";
import { storeImage } from "./image-store";
import { deleteImage, getImage, imageUsage } from "./images";
import { composeInWorker } from "./ml";
import type { Product } from "./schema";
import sharp from "./sharp";
import { toSlug } from "./slug.mjs";

export type FrameRenderStatus = "done" | "skipped";

export interface FrameRenderResult {
  status: FrameRenderStatus;
  car: string;
  message: string;
  thumb: string;
}

function newestGeneration(productId: string): string | null {
  const cars = [...getProductCars(productId)].sort((a, b) => (b.yearFrom ?? 0) - (a.yearFrom ?? 0));
  return cars[0]?.generationId ?? null;
}

async function dropUnused(imagePath: string): Promise<void> {
  if (imageUsage(imagePath).length) return;
  const entry = getImage(imagePath);
  deleteImage(imagePath);
  if (entry) await removeImageFiles(entry, path.join(process.cwd(), "public"));
}

async function ensureFramePhoto(categoryId: string, type: string, frame: Buffer): Promise<string | null> {
  const imagePath = framePhotoPath(categoryId, type, frame);
  if (getImage(imagePath)) return imagePath;
  const stored = await storeImage({
    source: await framePhotoJpeg(sharp, frame),
    folder: path.posix.dirname(imagePath),
    filename: path.posix.basename(imagePath),
  });
  return stored?.path ?? null;
}

function putFirst(productId: string, image: string, previous: string | null, photo: string | null): string[] {
  const db = getDb();
  const row = db.prepare("SELECT data FROM products WHERE id = ?").get(productId) as
    | { data: string }
    | undefined;
  if (!row) throw new Error("Товар не найден");
  const product = JSON.parse(row.data) as Product;
  const before = product.images;
  const images = [image, ...before.filter((item) => item !== image && item !== previous)];
  product.images = photo ? withFramePhoto(images, photo) : images;
  const now = Date.now();
  db.transaction(() => {
    db.prepare("UPDATE products SET data = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(product),
      now,
      productId,
    );
    db.prepare(
      `INSERT INTO frame_renders (product_id, image, created_at) VALUES (?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET image = excluded.image, created_at = excluded.created_at`,
    ).run(productId, image, now);
  })();
  bumpCatalogVersion();
  return before.filter((item) => isFramePhoto(item) && !product.images.includes(item));
}

export function renderFrameProduct(
  categoryId: string,
  type: string,
  productId: string,
): Promise<FrameRenderResult> {
  return exclusive(`render:${productId}`, () => renderUnlocked(categoryId, type, productId));
}

async function renderUnlocked(
  categoryId: string,
  type: string,
  productId: string,
): Promise<FrameRenderResult> {
  const group = getFrameType(categoryId, type);
  if (!group?.products.some((product) => product.id === productId)) {
    throw new Error("Товар не относится к этому типу");
  }
  const frame = readFrameImage(categoryId, type);
  const settings = frameComposerSettings(categoryId, type);
  if (!frame || !settings) throw new Error("Сначала сохраните фото рамки и оформление");

  const generationId = newestGeneration(productId);
  if (!generationId) {
    return { status: "skipped", car: "", message: "у товара не указана машина", thumb: "" };
  }
  const info = getGenerationInfo(generationId);
  if (!info) return { status: "skipped", car: "", message: "поколение не найдено", thumb: "" };
  const label = composerLabel(info, new Date().getFullYear());

  const { photo } = await ensureCarFrontPhoto(generationId);
  if (!photo) {
    return {
      status: "skipped",
      car: label,
      message: "нет фото автомобиля — выберите его в генераторе картинок у товара",
      thumb: "",
    };
  }

  const image = await composeInWorker({
    ...settings,
    product: frame,
    car: await readCarFrontPhoto(photo),
    label,
  });
  const stored = await storeImage({
    source: image,
    folder: `${categoryId}/${productId}`,
    filename: `${toSlug(label) || "ramka"}.jpg`,
  });
  if (!stored) throw new Error("Не удалось сохранить картинку");

  const previous =
    (
      getDb().prepare("SELECT image FROM frame_renders WHERE product_id = ?").get(productId) as
        | { image: string }
        | undefined
    )?.image ?? null;
  const framePhoto = await ensureFramePhoto(categoryId, type, frame);
  const replacedPhotos = putFirst(productId, stored.path, previous, framePhoto);
  if (previous && previous !== stored.path) await dropUnused(previous);
  for (const replaced of replacedPhotos) await dropUnused(replaced);

  return { status: "done", car: label, message: "", thumb: stored.thumb };
}
