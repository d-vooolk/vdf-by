/**
 * Типы манифеста картинок и чистые помощники к нему.
 *
 * Этот модуль намеренно без обращений к файловой системе: его импортируют
 * и серверные компоненты, и клиентские (галерея, корзина).
 */

export interface ImageVariant {
  w: number;
  url: string;
}

export interface ImageEntry {
  /** Размеры исходника — из них считается aspect-ratio, чтобы не было CLS. */
  w: number;
  h: number;
  /** Размытая заглушка (data-URI), показывается пока грузится фото. */
  blur: string;
  sources: Record<string, ImageVariant[]>;
  fallback: string;
}

/** Набор записей манифеста, который сервер передаёт в клиентский компонент. */
export type ImageMap = Record<string, ImageEntry>;

/** srcset для одного формата. */
export function srcSet(variants: ImageVariant[] | undefined): string {
  if (!variants?.length) return "";
  return variants.map((variant) => `${variant.url} ${variant.w}w`).join(", ");
}

/**
 * Один URL нужной ширины — для миниатюр в корзине и в письме заказа,
 * где srcset не нужен.
 */
export function pickUrl(
  entry: ImageEntry | null | undefined,
  width: number,
): string | null {
  if (!entry) return null;
  const variants = entry.sources.webp ?? Object.values(entry.sources)[0];
  if (!variants?.length) return entry.fallback || null;
  const suitable = variants.find((variant) => variant.w >= width);
  return (suitable ?? variants[variants.length - 1]).url;
}

export function largestVariantUrl(entry: ImageEntry | null | undefined): string | null {
  if (!entry) return null;
  const variants = entry.sources.webp ?? Object.values(entry.sources)[0] ?? [];
  const largest = variants.reduce<ImageVariant | undefined>(
    (best, variant) => (!best || variant.w > best.w ? variant : best),
    undefined,
  );
  return largest?.url ?? (entry.fallback || null);
}
