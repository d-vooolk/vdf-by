import {
  categoryTrail,
  getCategories,
  getCategoryById,
  getProducts,
} from "./catalog";
import { getImage } from "./images";
import { absoluteUrl, bigImageUrl, variantUrl } from "./seo";
import { allSelections, defaultSelection, hasPrice, resolveVariant } from "./variant";

/**
 * Товарные фиды: данные для них считаются здесь, один раз для обоих форматов.
 *
 * Форматов два, потому что площадки разные:
 *
 *   /feed.xml — RSS с полями g:* для Google Merchant Center. Через него
 *               товары попадают в бесплатные карточки Google Покупок.
 *   /yml.xml  — YML, формат Яндекса. Его же просят Onliner и Kufar, а это
 *               в Беларуси заметный источник трафика.
 *
 * Предложение — не товар, а комбинация опций: у H4 и H7 своя цена, свой
 * артикул и свой адрес, и площадка обязана видеть их по отдельности. Иначе
 * покупатель приходит по цене H4 на страницу, где выбран H7.
 *
 * Оба маршрута статические и пересобираются вместе с каталогом (см.
 * src/lib/revalidate.ts): гонять по шести сотням товаров на каждый запрос
 * робота площадки незачем.
 */

export interface FeedOffer {
  /** Уникальный код предложения: товар или товар + выбранные опции. */
  id: string;
  /** Код товара — общий для всех его вариантов. Пусто, если вариант один. */
  groupId: string | null;
  title: string;
  description: string;
  /** Полный адрес с параметрами варианта — открывает сразу нужный цоколь. */
  url: string;
  images: string[];
  price: number;
  oldPrice: number | null;
  available: boolean;
  brand: string | null;
  sku: string | null;
  categoryId: string;
  /** Путь по разделам: «Лампы › Галогенные» — для типа товара в фиде. */
  categoryPath: string;
  unit: string | null;
  /** Характеристики и выбранные опции — параметрами предложения. */
  params: Array<{ name: string; value: string }>;
}

function plainText(value: string | undefined, limit: number): string {
  if (!value) return "";
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function imagesFor(paths: string[]): string[] {
  return paths
    .map((path) => bigImageUrl(getImage(path)))
    .filter((url): url is string => Boolean(url))
    .map((url) => absoluteUrl(url));
}

/** Все предложения каталога — по одному на комбинацию опций. */
export function feedOffers(): FeedOffer[] {
  const offers: FeedOffer[] = [];

  for (const product of getProducts()) {
    const category = getCategoryById(product.categoryId);
    const categoryPath = category
      ? categoryTrail(category)
          .map((entry) => entry.name)
          .join(" > ")
      : "";

    // Без опций предложение одно: сам товар. С опциями — по одному на
    // каждую комбинацию, с её ценой, наличием и артикулом.
    const selections = product.optionGroups.length
      ? allSelections(product)
      : [defaultSelection(product)];
    const hasVariants = product.optionGroups.length > 0;

    for (const selection of selections) {
      const variant = resolveVariant(product, selection);
      if (!hasPrice(variant.price)) continue;
      const suffix = hasVariants
        ? `-${product.optionGroups
            .map((group) => selection[group.id])
            .filter(Boolean)
            .join("-")}`
        : "";

      offers.push({
        id: `${product.id}${suffix}`,
        groupId: hasVariants ? product.id : null,
        title: hasVariants
          ? `${product.title}, ${variant.label}`
          : product.title,
        description: plainText(
          product.description ?? product.title,
          3000,
        ),
        url: variantUrl(product, selection),
        images: imagesFor(variant.images.length ? variant.images : product.images),
        price: variant.price,
        oldPrice: variant.oldPrice,
        available: variant.inStock,
        brand: product.brand ?? null,
        sku: variant.sku,
        categoryId: product.categoryId,
        categoryPath,
        unit: product.unit ?? null,
        params: [
          ...variant.selected.map((entry) => ({
            name: entry.groupName,
            value: entry.value.label,
          })),
          ...product.specs.map((spec) => ({
            name: spec.name,
            value: spec.value,
          })),
        ],
      });
    }
  }

  return offers;
}

/** Разделы каталога с числовыми номерами: YML не принимает slug'и. */
export function feedCategories(): Array<{
  number: number;
  parentNumber: number | null;
  id: string;
  name: string;
}> {
  const categories = getCategories();
  const numbers = new Map<string, number>();
  categories.forEach((category, index) => numbers.set(category.id, index + 1));

  return categories.map((category) => ({
    number: numbers.get(category.id)!,
    parentNumber: category.parentId
      ? (numbers.get(category.parentId) ?? null)
      : null,
    id: category.id,
    name: category.name,
  }));
}

/**
 * Убирает пустые строки, оставшиеся от необязательных полей.
 *
 * Шаблонные строки с условиями («есть бренд — выводим, нет — пустая строка»)
 * оставляют в фиде десятки пустых строк на каждый товар. Формату всё равно,
 * но фид на шестьсот позиций от этого толстеет на сотни килобайт, а читать
 * его глазами при разборе ошибок площадки становится невозможно.
 */
export function compact(value: string): string {
  return value.replace(/^[ \t]*\r?\n/gm, "");
}

/** Экранирование для XML. Без него один амперсанд ломает весь фид. */
export function xml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
