import { getImage } from "./images";

/**
 * Готовые ссылки на миниатюры для форм админки: путь -> адрес картинки.
 *
 * Формы получают их с сервера, а не собирают строкой из имени файла. Разница
 * видна на узких фото: версии на 400px у них нет вообще, и «умная» догадка
 * дала бы битую ссылку. Здесь берётся самая мелкая из реально созданных, а
 * если ни одной нет — jpeg-фолбэк.
 *
 * Размытые заглушки (blur) в результат не попадают: это самая тяжёлая часть
 * записи, а миниатюре в форме она не нужна.
 */
export function withCategoryThumbs<T extends { image: string | null }>(
  categories: T[],
): Array<T & { thumb: string | null }> {
  const thumbs = thumbsFor(
    categories.flatMap((category) => (category.image ? [category.image] : [])),
  );
  return categories.map((category) => ({
    ...category,
    thumb: category.image ? (thumbs[category.image] ?? null) : null,
  }));
}

export function thumbsFor(paths: string[]): Record<string, string> {
  const thumbs: Record<string, string> = {};

  for (const path of paths) {
    const entry = getImage(path);
    if (!entry) continue;

    const smallest =
      entry.sources.webp?.[0]?.url ??
      Object.values(entry.sources)[0]?.[0]?.url ??
      entry.fallback;

    if (smallest) thumbs[path] = smallest;
  }

  return thumbs;
}
