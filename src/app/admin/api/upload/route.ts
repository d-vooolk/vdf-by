import path from "node:path";

import { getAdmin } from "@/lib/auth";
import { ACCEPTED } from "@/lib/image-pipeline.mjs";
import { storeImage } from "@/lib/image-store";
import { revalidateImages } from "@/lib/revalidate";

/**
 * Загрузка фотографий из админки.
 *
 * Route handler, а не Server Action, и это не вкусовщина: у Server Actions
 * тело запроса по умолчанию ограничено одним мегабайтом, а снимок с телефона
 * весит пять. Поднимать лимит для всех действий сразу ради одной формы —
 * плохой размен.
 *
 * Файл прогоняется через тот же конвейер, что и скрипт первичного импорта
 * (src/lib/image-pipeline.mjs): avif и webp в четырёх ширинах, jpeg-фолбэк и
 * размытая заглушка. Результат — в public/img, запись — в таблицу images.
 */

export const dynamic = "force-dynamic";

/** Больше 20 МБ — это уже не фото товара, а недоразумение. */
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 20;

interface Uploaded {
  path: string;
  thumb: string;
  w: number;
  h: number;
  /** Имя пришлось изменить: такой путь уже был занят. */
  renamed: boolean;
}

export async function POST(request: Request) {
  // Проверяем сессию честно, а не полагаемся на proxy.ts: у route handler'а
  // это такой же публичный адрес, как у любого другого.
  const admin = await getAdmin();
  if (!admin) {
    return Response.json({ error: "Нужно войти заново" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Не удалось прочитать файлы" }, { status: 400 });
  }

  const folder = String(form.get("folder") ?? "");
  const files = form.getAll("files").filter((item): item is File => item instanceof File);

  if (!files.length) {
    return Response.json({ error: "Файлы не выбраны" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return Response.json(
      { error: `За раз можно загрузить не больше ${MAX_FILES} фото` },
      { status: 400 },
    );
  }

  const uploaded: Uploaded[] = [];
  const problems: string[] = [];

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      problems.push(`${file.name}: больше 20 МБ`);
      continue;
    }

    const extension = path.extname(file.name).slice(1).toLowerCase();
    if (!ACCEPTED.has(extension)) {
      problems.push(`${file.name}: поддерживаются jpg, png, webp и avif`);
      continue;
    }

    try {
      const stored = await storeImage({
        source: Buffer.from(await file.arrayBuffer()),
        folder,
        filename: file.name,
      });

      if (!stored) {
        problems.push(`${file.name}: не похоже на картинку`);
        continue;
      }

      uploaded.push(stored);
    } catch (error) {
      console.error("[upload]", file.name, error);
      problems.push(`${file.name}: ${(error as Error).message}`);
    }
  }

  if (uploaded.length) revalidateImages();

  return Response.json({
    ok: uploaded.length > 0,
    uploaded,
    problems,
  });
}
