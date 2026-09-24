import type { OptionValue, Product } from "./schema";

/**
 * Разрешение опций товара: цоколь H7/HB4/H11, сторона, цветовая температура.
 *
 * Правила — специально простые, чтобы поведение было предсказуемым при
 * ручной правке JSON:
 *
 * ГАЛЕРЕЯ. Берётся у первого (в порядке объявления в optionGroups) выбранного
 * значения, у которого заполнено поле images. Если ни у одного выбранного
 * значения своих фото нет — показываются общие фото товара (product.images).
 *
 * ЦЕНА. За основу берётся price первого выбранного значения, у которого это
 * поле задано; если ни у одного не задано — цена товара. Затем к результату
 * прибавляются все priceDelta выбранных значений.
 *
 * НАЛИЧИЕ. Товар доступен, если сам он в наличии И ни у одного выбранного
 * значения не стоит inStock: false.
 *
 * Функции здесь чистые: те же данные на сервере при сборке и в браузере при
 * переключении опции дают тот же результат.
 */

/** Что выбрано: id набора опций -> id значения. */
export type Selection = Record<string, string>;

export interface ResolvedVariant {
  images: string[];
  price: number;
  oldPrice: number | null;
  inStock: boolean;
  sku: string | null;
  /** «H7 · 5000K» — для корзины, заказа и alt у картинок. */
  label: string;
  /** Устойчивый ключ позиции в корзине. */
  key: string;
  /** Выбранные значения по каждому набору, в порядке объявления. */
  selected: Array<{
    groupId: string;
    groupName: string;
    value: OptionValue;
  }>;
}

/** Первое значение в наличии из каждого набора, иначе просто первое. */
export function defaultSelection(product: Product): Selection {
  const selection: Selection = {};
  for (const group of product.optionGroups) {
    const available = group.values.find((v) => v.inStock !== false);
    selection[group.id] = (available ?? group.values[0]).id;
  }
  return selection;
}

/** Ключ позиции корзины: товар + выбранные опции. */
export function variantKey(productId: string, selection: Selection): string {
  const parts = Object.keys(selection)
    .sort()
    .map((groupId) => `${groupId}:${selection[groupId]}`);
  return parts.length ? `${productId}|${parts.join("|")}` : productId;
}

export function resolveVariant(
  product: Product,
  selection: Selection,
): ResolvedVariant {
  const selected: ResolvedVariant["selected"] = [];

  for (const group of product.optionGroups) {
    const wanted = selection[group.id];
    const value =
      group.values.find((v) => v.id === wanted) ?? group.values[0];
    selected.push({ groupId: group.id, groupName: group.name, value });
  }

  // Галерея: первое выбранное значение со своими фото; иначе общие фото.
  const ownImages = selected.find(
    (entry) => entry.value.images && entry.value.images.length > 0,
  )?.value.images;

  // Цена: первая абсолютная + сумма надбавок.
  const absolute = selected.find(
    (entry) => entry.value.price !== undefined,
  )?.value.price;
  const delta = selected.reduce(
    (sum, entry) => sum + (entry.value.priceDelta ?? 0),
    0,
  );
  const price = Math.max(0, (absolute ?? product.price) + delta);

  const oldFromValue = selected.find(
    (entry) => entry.value.oldPrice !== undefined,
  )?.value.oldPrice;
  const oldPriceBase = oldFromValue ?? product.oldPrice ?? null;
  const oldPrice =
    oldPriceBase === null ? null : Math.max(0, oldPriceBase + delta);

  const inStock =
    product.inStock && selected.every((entry) => entry.value.inStock !== false);

  const sku =
    selected.find((entry) => entry.value.sku)?.value.sku ?? product.sku ?? null;

  return {
    images: ownImages?.length ? ownImages : product.images,
    price,
    // Зачёркнутую цену показываем только если она реально выше текущей.
    oldPrice: oldPrice !== null && oldPrice > price ? oldPrice : null,
    inStock,
    sku,
    label: selected.map((entry) => entry.value.label).join(" · "),
    key: variantKey(product.id, selection),
    selected,
  };
}

/**
 * Выбранные опции строкой запроса: «?cokol=h7&temperatura=5000k».
 *
 * Один и тот же адрес нужен в двух местах: в разметке — как адрес
 * предложения по этой комбинации, и в браузере — чтобы ссылку на конкретный
 * цоколь можно было скинуть в переписке. Собирается здесь, в чистом модуле,
 * потому что читают его и сервер, и клиент.
 *
 * Порядок параметров — как объявлены наборы опций, а не как их выбирали:
 * иначе один и тот же вариант получал бы разные адреса.
 */
export function variantQuery(product: Product, selection: Selection): string {
  const params = product.optionGroups
    .map((group) => [group.id, selection[group.id]] as const)
    .filter(([, value]) => Boolean(value))
    .map(
      ([group, value]) =>
        `${encodeURIComponent(group)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  return params ? `?${params}` : "";
}

/**
 * Обратная операция: выбор, записанный в адресе страницы.
 *
 * Чужие и устаревшие значения отбрасываются молча — ссылка на цоколь,
 * которого больше нет в товаре, должна открыть товар, а не сломать страницу.
 */
export function selectionFromQuery(
  product: Product,
  search: string,
): Selection {
  const params = new URLSearchParams(search);
  const selection: Selection = {};

  for (const group of product.optionGroups) {
    const wanted = params.get(group.id);
    if (wanted && group.values.some((value) => value.id === wanted)) {
      selection[group.id] = wanted;
    }
  }

  return selection;
}

/** Все комбинации опций. Нужен для «от … р.» и для валидности JSON-LD. */
export function allSelections(product: Product): Selection[] {
  let combos: Selection[] = [{}];
  for (const group of product.optionGroups) {
    const next: Selection[] = [];
    for (const combo of combos) {
      for (const value of group.values) {
        next.push({ ...combo, [group.id]: value.id });
      }
    }
    combos = next;
    // Страховка от товара с десятком наборов опций: считать 100k комбинаций
    // на каждой карточке — верный способ убить время сборки.
    if (combos.length > 512) return combos.slice(0, 512);
  }
  return combos;
}

export interface PriceRange {
  min: number;
  max: number;
  /** true, если цена зависит от выбора опций. */
  varies: boolean;
}

export function priceRange(product: Product): PriceRange {
  if (!product.optionGroups.length) {
    return { min: product.price, max: product.price, varies: false };
  }
  const prices = allSelections(product)
    .map((selection) => resolveVariant(product, selection).price)
    .filter(hasPrice);
  if (!prices.length) return { min: 0, max: 0, varies: false };
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, varies: min !== max };
}

export const PRICE_ON_REQUEST = "Цену уточняйте";

export function hasPrice(price: number): boolean {
  return price > 0;
}

export function isOrderable(variant: { price: number; inStock: boolean }): boolean {
  return variant.inStock && hasPrice(variant.price);
}

export function cheapestPrice(products: Product[]): number {
  const prices = products.map((product) => priceRange(product).min).filter(hasPrice);
  return prices.length ? Math.min(...prices) : 0;
}

/** Есть ли хоть одна доступная комбинация — для бейджа на карточке. */
export function hasAnyInStock(product: Product): boolean {
  if (!product.inStock) return false;
  if (!product.optionGroups.length) return true;
  return product.optionGroups.every((group) =>
    group.values.some((value) => value.inStock !== false),
  );
}

/**
 * Все фото товара, включая галереи опций. Нужно, чтобы препроцессор
 * картинок и JSON-LD видели полный набор.
 */
export function allProductImages(product: Product): string[] {
  const images = new Set(product.images);
  for (const group of product.optionGroups) {
    for (const value of group.values) {
      for (const image of value.images ?? []) images.add(image);
    }
  }
  return [...images];
}
