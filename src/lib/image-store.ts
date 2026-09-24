import path from "node:path";

import sharp from "sharp";

import { processImage, safeImagePath } from "./image-pipeline.mjs";
import type { ImageEntry } from "./image-types";
import { getImage, saveImage } from "./images";

export interface StoredImage {
  path: string;
  thumb: string;
  w: number;
  h: number;
  renamed: boolean;
}

export async function storeImage({
  source,
  folder,
  filename,
}: {
  source: Buffer;
  folder: string;
  filename: string;
}): Promise<StoredImage | null> {
  // Имя приходит из браузера, поэтому приводится к безопасному виду —
  // «../../» в пути здесь вполне может оказаться.
  let relativePath = safeImagePath(folder, filename);

  // Одинаковые имена — обычное дело: с телефона все снимки называются
  // IMG_0001. Молча затирать чужое фото нельзя, поэтому добавляем суффикс.
  const renamed = Boolean(getImage(relativePath));
  if (renamed) {
    const extension = path.extname(relativePath);
    const base = relativePath.slice(0, -extension.length);
    let counter = 2;
    while (getImage(`${base}-${counter}${extension}`)) counter += 1;
    relativePath = `${base}-${counter}${extension}`;
  }

  const result = await processImage({
    source,
    relativePath,
    outDir: path.join(process.cwd(), "public", "img"),
    sharp,
  });
  if (!result) return null;

  const entry = result.entry as ImageEntry;
  saveImage(relativePath, entry, result.bytes);

  return {
    path: relativePath,
    // Миниатюра для интерфейса: самая узкая версия webp.
    thumb: entry.sources.webp?.[0]?.url ?? entry.fallback,
    w: entry.w,
    h: entry.h,
    renamed,
  };
}
