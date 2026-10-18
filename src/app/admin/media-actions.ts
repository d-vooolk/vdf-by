"use server";

import { join } from "node:path";
import { removeImageFiles } from "@/lib/image-pipeline.mjs";
import {
  deleteImage,
  getImage,
  imageUsage,
  usedImagePaths,
} from "@/lib/images";
import { revalidateImages } from "@/lib/revalidate";
import { requireAdmin } from "@/lib/auth";
import { fail, type FormState, ok } from "./form-state";

/* ------------------------------------------------------------------ */
/* Фотографии                                                          */
/* ------------------------------------------------------------------ */

export async function deleteImageAction(path: string): Promise<FormState> {
  await requireAdmin();

  const entry = getImage(path);
  if (!entry) return fail(["Такой фотографии нет"]);

  // Фото, которое где-то стоит, удалять не даём: на его месте молча появилась
  // бы заглушка, и заметили бы это нескоро.
  const used = imageUsage(path);
  if (used.length) {
    return fail([
      `Фото используется: ${used.slice(0, 5).join(", ")}${
        used.length > 5 ? ` и ещё ${used.length - 5}` : ""
      }. Сначала уберите его оттуда.`,
    ]);
  }

  // Сначала запись, потом файлы: если удаление файлов сорвётся на половине,
  // в public/img останется мусор, но битой ссылки в каталоге не появится.
  deleteImage(path);
  await removeImageFiles(entry, join(process.cwd(), "public"));

  revalidateImages();
  return ok();
}

const UNUSED_BATCH = 200;

export async function deleteUnusedImagesAction(
  paths: string[],
): Promise<FormState & { deleted: string[] }> {
  await requireAdmin();
  if (!Array.isArray(paths) || paths.length > UNUSED_BATCH) {
    return { ...fail(["Некорректный запрос"]), deleted: [] };
  }

  const used = usedImagePaths();
  const deleted: string[] = [];
  const skipped: string[] = [];
  const publicDir = join(process.cwd(), "public");

  for (const path of paths) {
    const entry = typeof path === "string" ? getImage(path) : null;
    if (!entry) continue;
    if (used.has(path)) {
      skipped.push(path);
      continue;
    }
    deleteImage(path);
    await removeImageFiles(entry, publicDir);
    deleted.push(path);
  }

  if (deleted.length) revalidateImages();
  const problems = skipped.length
    ? [`Пропущено ${skipped.length}: эти фото успели снова начать использоваться`]
    : [];
  return { ok: true, problems, at: Date.now(), deleted };
}
