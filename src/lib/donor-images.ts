import path from "node:path";

import sharp from "sharp";

import { assertPublicUrl } from "./donor-page";
import { storeImage, type StoredImage } from "./image-store";
import { revalidateImages } from "./revalidate";

const MAX_IMAGES = 10;
const MAX_DOWNLOADS = 20;
const MAX_BYTES = 20 * 1024 * 1024;
const MIN_SIDE = 300;
const PARALLEL = 3;
const SAME_PICTURE_DISTANCE = 6;
const TIMEOUT_MS = 20000;
const FORMAT_EXTENSION: Record<string, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  avif: "avif",
  heif: "avif",
};

export interface DonorImagesResult {
  images: Array<Pick<StoredImage, "path" | "thumb">>;
  problems: string[];
}

interface Downloaded {
  order: number;
  url: string;
  source: Buffer;
  extension: string;
  pixels: number;
  fingerprint: bigint;
}

async function fingerprint(source: Buffer): Promise<bigint> {
  const pixels = await sharp(source).resize(8, 8, { fit: "fill" }).greyscale().raw().toBuffer();
  const average = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  let hash = BigInt(0);
  for (const value of pixels) hash = (hash << BigInt(1)) | BigInt(value > average ? 1 : 0);
  return hash;
}

function distance(a: bigint, b: bigint): number {
  let diff = a ^ b;
  let count = 0;
  while (diff > BigInt(0)) {
    count += Number(diff & BigInt(1));
    diff >>= BigInt(1);
  }
  return count;
}

async function download(url: string, order: number, referer: string): Promise<Downloaded | null> {
  await assertPublicUrl(url);
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
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    await response.body?.cancel();
    return null;
  }
  const source = Buffer.from(await response.arrayBuffer());
  if (source.byteLength > MAX_BYTES) return null;

  const meta = await sharp(source).metadata().catch(() => null);
  const extension = meta?.format ? FORMAT_EXTENSION[meta.format] : undefined;
  if (!meta?.width || !meta.height || !extension) return null;
  if (Math.min(meta.width, meta.height) < MIN_SIDE) return null;

  return {
    order,
    url,
    source,
    extension,
    pixels: meta.width * meta.height,
    fingerprint: await fingerprint(source),
  };
}

function fileName(url: string, extension: string, index: number): string {
  const base = path
    .basename(new URL(url).pathname)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\.(?:jpe?g|png|webp|avif)/gi, "")
    .replace(/[-_](?:\d{2,4}x\d{2,4}|\d{3,4})$/i, "");
  return `${base || `photo-${index + 1}`}.${extension}`;
}

export async function downloadDonorImages(
  urls: string[],
  folder: string,
  referer: string,
): Promise<DonorImagesResult> {
  const problems: string[] = [];
  const queue = urls.slice(0, MAX_DOWNLOADS).map((url, order) => ({ url, order }));
  const downloaded: Downloaded[] = [];

  const lanes = Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        const result = await download(job.url, job.order, referer);
        if (result) downloaded.push(result);
      } catch {}
    }
  });
  await Promise.all(lanes);

  const unique: Downloaded[] = [];
  for (const candidate of downloaded.sort((a, b) => a.order - b.order)) {
    const twin = unique.findIndex(
      (kept) => distance(kept.fingerprint, candidate.fingerprint) <= SAME_PICTURE_DISTANCE,
    );
    if (twin < 0) unique.push(candidate);
    else if (candidate.pixels > unique[twin].pixels) unique[twin] = { ...candidate, order: unique[twin].order };
  }

  const images: DonorImagesResult["images"] = [];
  for (const [index, picture] of unique.slice(0, MAX_IMAGES).entries()) {
    try {
      const stored = await storeImage({
        source: picture.source,
        folder,
        filename: fileName(picture.url, picture.extension, index),
      });
      if (stored) images.push({ path: stored.path, thumb: stored.thumb });
    } catch (error) {
      console.error("[donor-images]", picture.url, error);
      problems.push(`${path.basename(new URL(picture.url).pathname)}: не удалось обработать`);
    }
  }

  if (images.length) revalidateImages();
  if (!images.length && urls.length) problems.push("Фото на странице не нашлись или слишком мелкие");
  if (!urls.length) problems.push("На странице не нашлось фото товара");
  return { images, problems };
}
