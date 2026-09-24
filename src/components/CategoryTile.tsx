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
      className="group card card-link reveal flex w-16 flex-col overflow-hidden sm:w-[4.5rem]"
    >
      <span className="relative block aspect-square overflow-hidden bg-white">
        <Picture
          entry={getImage(category.image)}
          alt=""
          sizes="72px"
          priority={priority}
          className="h-full w-full object-contain transition-transform duration-300 ease-out group-hover:scale-105"
        />
      </span>

      <span className="border-t border-brand-100 px-0.5 py-1 text-center text-[10px] leading-tight font-semibold tracking-tight break-words hyphens-auto text-brand-900 transition-colors group-hover:text-brand-600">
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
      className={`flex flex-wrap gap-2 ${className}`}
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
