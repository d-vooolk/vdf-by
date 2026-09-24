import Link from "next/link";

import { Picture } from "@/components/Picture";
import { categoryUrl } from "@/lib/catalog";
import { getImage } from "@/lib/images";
import type { Category } from "@/lib/schema";

/**
 * Плитка раздела: картинка и подпись под ней. Больше ничего.
 *
 * Раньше рядом с названием стояли счётчик товаров и описание раздела на две
 * строки — на главной это давало полосу из трёх разных кеглей в каждой
 * плитке, и взгляду не за что было зацепиться. Выбирают раздел по картинке,
 * а не по тому, что в нём «42 товара»; описание же есть на самой странице
 * раздела, куда плитка и ведёт.
 *
 * Один компонент на все три места, где показываются разделы: главная,
 * страница каталога и плитка подразделов внутри раздела. Разъехаться им
 * теперь нечем.
 */

interface CategoryTileProps {
  category: Category;
  /** Для первых плиток первого экрана — грузить фото сразу, не лениво. */
  priority?: boolean;
}

export function CategoryTile({ category, priority = false }: CategoryTileProps) {
  return (
    <Link
      href={categoryUrl(category)}
      className="group card card-link reveal flex flex-col overflow-hidden"
    >
      <span className="relative block aspect-[4/3] overflow-hidden bg-white">
        <Picture
          entry={getImage(category.image)}
          alt=""
          sizes="(max-width: 640px) 24vw, (max-width: 1024px) 16vw, 150px"
          priority={priority}
          className="h-full w-full object-contain transition-transform duration-300 ease-out group-hover:scale-105"
        />
      </span>

      <span className="border-t border-brand-100 px-1.5 py-1.5 text-center text-[11px] leading-tight font-semibold sm:text-xs text-brand-900 transition-colors group-hover:text-brand-600">
        {category.name}
      </span>
    </Link>
  );
}

/** Сетка плиток — чтобы три страницы не задавали её каждая по-своему. */
export function CategoryGrid({
  categories,
  priorityCount = 0,
  className = "",
}: {
  categories: Category[];
  priorityCount?: number;
  className?: string;
}) {
  if (!categories.length) return null;

  return (
    <div
      className={`grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 ${className}`}
    >
      {categories.map((category, position) => (
        <CategoryTile
          key={category.id}
          category={category}
          priority={position < priorityCount}
        />
      ))}
    </div>
  );
}
