import { join } from "node:path";

import { getDb } from "./db";
import { removeImageFiles } from "./image-pipeline.mjs";
import { deleteImage, getImage, listImages, usedImagePaths } from "./images";
import { revalidateImages } from "./revalidate";

export const UNUSED_KEEP_DAYS = 7;
const UNUSED_KEEP_MS = UNUSED_KEEP_DAYS * 24 * 60 * 60 * 1000;

export function trackUnusedImages(now = Date.now()): Map<string, number> {
  const db = getDb();
  const used = usedImagePaths();
  const unused = listImages()
    .map((image) => image.path)
    .filter((path) => !used.has(path));

  db.transaction(() => {
    db.exec("CREATE TEMP TABLE IF NOT EXISTS unused_now (path TEXT PRIMARY KEY)");
    db.exec("DELETE FROM unused_now");
    const remember = db.prepare("INSERT INTO unused_now (path) VALUES (?)");
    for (const path of unused) remember.run(path);
    db.exec("DELETE FROM image_unused_since WHERE path NOT IN (SELECT path FROM unused_now)");
    db.prepare(
      "INSERT OR IGNORE INTO image_unused_since (path, since) SELECT path, ? FROM unused_now",
    ).run(now);
    db.exec("DELETE FROM unused_now");
  })();

  const rows = db.prepare("SELECT path, since FROM image_unused_since").all() as Array<{
    path: string;
    since: number;
  }>;
  return new Map(rows.map((row) => [row.path, row.since]));
}

export async function deleteLongUnusedImages(now = Date.now()) {
  const since = trackUnusedImages(now);
  const expired = [...since].filter(([, at]) => now - at >= UNUSED_KEEP_MS).map(([path]) => path);
  const used = usedImagePaths();
  const publicDir = join(process.cwd(), "public");
  const forget = getDb().prepare("DELETE FROM image_unused_since WHERE path = ?");
  const deleted: string[] = [];

  for (const path of expired) {
    const entry = getImage(path);
    forget.run(path);
    if (!entry || used.has(path)) continue;
    deleteImage(path);
    await removeImageFiles(entry, publicDir);
    deleted.push(path);
  }

  if (deleted.length) revalidateImages();
  return { tracked: since.size - deleted.length, deleted };
}
