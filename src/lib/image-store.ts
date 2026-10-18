import { createHash } from "node:crypto";
import path from "node:path";

import sharp from "./sharp";

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

function thumbOf(entry: ImageEntry): string {
  return entry.sources.webp?.[0]?.url ?? entry.fallback;
}

function contentPath(source: Buffer, safePath: string): string {
  const digest = createHash("sha256").update(source).digest("hex").slice(0, 10);
  const extension = path.extname(safePath);
  return `${safePath.slice(0, -extension.length)}-${digest}${extension}`;
}

export async function storeImage({
  source,
  folder,
  filename,
  keepName = false,
}: {
  source: Buffer;
  folder: string;
  filename: string;
  keepName?: boolean;
}): Promise<StoredImage | null> {
  // Имя приходит из браузера, поэтому приводится к безопасному виду —
  // «../../» в пути здесь вполне может оказаться.
  const safePath = safeImagePath(folder, filename);
  const relativePath = keepName ? safePath : contentPath(source, safePath);

  const existing = getImage(relativePath);
  if (existing) {
    return { path: relativePath, thumb: thumbOf(existing), w: existing.w, h: existing.h, renamed: false };
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
    thumb: thumbOf(entry),
    w: entry.w,
    h: entry.h,
    renamed: relativePath !== safePath,
  };
}
