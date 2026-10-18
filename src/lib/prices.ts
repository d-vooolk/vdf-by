import { getProductById, getProducts } from "./catalog";
import type { Product } from "./schema";
import { stockGroupOf } from "./shared-stock";
import {
  allSelections,
  resolveVariant,
  variantStockQty,
  type Selection,
} from "./variant";

/**
 * Прайс по всем комбинациям опций: ключ позиции корзины -> цена и наличие.
 *
 * Нужен двоим, и это принципиально один и тот же расчёт:
 *
 *  1. Корзина в браузере сверяет с ним цены, сохранённые в localStorage —
 *     корзина недельной давности не должна показывать цену, которой уже нет.
 *  2. Приём заказа пересчитывает по нему сумму. Подставить в запрос цену
 *     «1 рубль» из консоли браузера несложно, поэтому цене из запроса мы
 *     не верим — берём свою.
 *
 * Если бы эти два места считали цену по-своему, любое расхождение выглядело
 * бы как обман покупателя: на экране одна сумма, у менеджера другая.
 */

export interface VariantPrice {
  price: number;
  inStock: boolean;
  stock?: number;
  weight?: number;
  category?: string;
}


export type PriceList = Record<string, VariantPrice>;

export function buildPriceList(): PriceList {
  const prices: PriceList = {};

  for (const product of getProducts()) {
    for (const selection of product.optionGroups.length ? allSelections(product) : [{}]) {
      const variant = resolveVariant(product, selection);
      prices[variant.key] = priceOf(product, variant);
    }
  }

  return prices;
}

function priceOf(product: Product, variant: ReturnType<typeof resolveVariant>): VariantPrice {
  return {
    price: variant.price,
    inStock: variant.inStock,
    stock: variantStockQty(product, variant),
    ...(variant.weight ? { weight: variant.weight } : {}),
    category: product.categoryId,
  };
}

export function variantPrice(key: string): VariantPrice | undefined {
  const [productId, ...parts] = key.split("|");
  const product = getProductById(productId);
  if (!product) return undefined;
  const selection: Selection = Object.fromEntries(parts.map((part) => part.split(":") as [string, string]));
  const complete =
    Object.keys(selection).length === product.optionGroups.length &&
    product.optionGroups.every((group) => group.values.some((value) => value.id === selection[group.id]));
  if (!complete) return undefined;
  const variant = resolveVariant(product, selection);
  return variant.key === key ? priceOf(product, variant) : undefined;
}

export interface StockedLine {
  key: string;
  title: string;
  qty: number;
}

export interface StockShortage {
  titles: string[];
  available: number;
  wanted: number;
}

export function stockShortages(
  lines: StockedLine[],
  released: StockedLine[] = [],
): StockShortage[] {
  const products = new Map(getProducts().map((product) => [product.id, product]));
  const pools = new Map<string, StockShortage>();

  const poolOf = (key: string) => {
    const [productId, ...parts] = key.split("|");
    const product = products.get(productId);
    if (!product) return null;

    const selection: Selection = Object.fromEntries(
      parts.map((part) => part.split(":") as [string, string]),
    );
    const variant = resolveVariant(product, selection);
    const available = variantStockQty(product, variant);
    if (available === undefined) return null;

    const countedValue = variant.selected.find((entry) => entry.value.stockQty !== undefined);
    const group = countedValue ? null : stockGroupOf(productId);
    const poolKey = countedValue
      ? `${productId}|${countedValue.groupId}:${countedValue.value.id}`
      : group
        ? `group|${group.categoryId}|${group.type}`
        : productId;

    const pool = pools.get(poolKey) ?? { titles: [], available, wanted: 0 };
    pools.set(poolKey, pool);
    return pool;
  };

  for (const line of lines) {
    const pool = poolOf(line.key);
    if (!pool) continue;
    pool.wanted += line.qty;
    if (!pool.titles.includes(line.title)) pool.titles.push(line.title);
  }
  for (const line of released) {
    const pool = poolOf(line.key);
    if (pool) pool.available += line.qty;
  }

  return [...pools.values()].filter((pool) => pool.wanted > pool.available);
}

export function describeShortage(shortage: StockShortage): string {
  const titles = shortage.titles.map((title) => `«${title}»`).join(", ");
  return shortage.available > 0
    ? `${titles} — в наличии ${shortage.available} шт., а нужно ${shortage.wanted}`
    : `${titles} — закончился`;
}
