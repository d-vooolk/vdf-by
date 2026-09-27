import { srcSet, type ImageEntry } from "@/lib/image-types";

/**
 * Картинка из манифеста: <picture> с avif/webp и jpeg-фолбэком.
 *
 * Модуль без "use client" и без обращений к файловой системе — поэтому
 * работает и в серверных компонентах (карточки товаров), и внутри
 * клиентских (галерея, корзина).
 *
 * Если записи в манифесте нет (фото ещё не положили в ./media), рисуется
 * аккуратная заглушка вместо битой картинки.
 *
 * Размытой подложки под фото здесь нет, и это сознательно. Раньше в style
 * подставлялся entry.blur с background-size: cover — задумка была показать
 * силуэт, пока грузится основное фото. Но почти все картинки в магазине
 * выводятся с object-contain: фото вписывается в рамку и по краям остаются
 * поля, сквозь которые размытая подложка видна всегда, а не «пока грузится».
 * Выглядело это как вторая, мутная копия товара за первой. Скачка вёрстки
 * без подложки тоже нет — его держат width и height из манифеста.
 */

interface PictureProps {
  entry: ImageEntry | null | undefined;
  alt: string;
  /** Обязателен: без него браузер качает картинку под всю ширину экрана. */
  sizes: string;
  className?: string;
  /** true только для главного фото первого экрана — остальное грузится лениво. */
  priority?: boolean;
}

export function Picture({
  entry,
  alt,
  sizes,
  className = "",
  priority = false,
}: PictureProps) {
  if (!entry) return <ImagePlaceholder className={className} />;

  const avif = srcSet(entry.sources.avif);
  const webp = srcSet(entry.sources.webp);

  return (
    <picture>
      {avif && <source type="image/avif" srcSet={avif} sizes={sizes} />}
      {webp && <source type="image/webp" srcSet={webp} sizes={sizes} />}
      <img
        src={entry.fallback}
        alt={alt}
        width={entry.w}
        height={entry.h}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        // fetchPriority="high" подсказывает браузеру начать загрузку LCP-фото
        // раньше остальных запросов.
        fetchPriority={priority ? "high" : "auto"}
        decoding={priority ? "auto" : "async"}
        className={className}
      />
    </picture>
  );
}

/** Заглушка на месте отсутствующего фото. */
export function ImagePlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        className="h-1/3 max-h-16 w-1/3 max-w-16 text-brand-300"
      >
        <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h4a6 6 0 0 1 0 12h-4A2.5 2.5 0 0 1 3 15.5v-7Z" />
        <path d="M14.5 9h6M13.8 12h7.2M14.5 15h6" />
      </svg>
    </div>
  );
}
