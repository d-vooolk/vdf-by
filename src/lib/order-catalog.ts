import { getProductById, getProducts } from "./catalog";
import type { OrderItem } from "./order-types";
import type { Product } from "./schema";
import { normalize } from "./search";
import {
  allSelections,
  resolveVariant,
  variantStockQty,
  type ResolvedVariant,
  type Selection,
} from "./variant";
import { costFor, wholesaleFor } from "./wholesale";

export interface OrderBuyer {
  staff: boolean;
  wholesale: boolean;
}

export interface OrderVariantOption {
  key: string;
  title: string;
  options: string;
  sku: string | null;
  price: number;
  inStock: boolean;
  stock: number | null;
}

function parseKey(key: string): { productId: string; selection: Selection } {
  const [productId, ...parts] = key.split("|");
  return {
    productId,
    selection: Object.fromEntries(parts.map((part) => part.split(":") as [string, string])),
  };
}

function buyerPrice(
  product: Product,
  selection: Selection,
  variant: ResolvedVariant,
  buyer: OrderBuyer,
): number {
  const special = buyer.staff
    ? costFor(product, selection)
    : buyer.wholesale
      ? wholesaleFor(product, selection)
      : null;
  return special ?? variant.price;
}

function toOption(product: Product, selection: Selection, buyer: OrderBuyer): OrderVariantOption {
  const variant = resolveVariant(product, selection);
  return {
    key: variant.key,
    title: product.title,
    options: variant.label,
    sku: variant.sku,
    price: buyerPrice(product, selection, variant, buyer),
    inStock: variant.inStock,
    stock: variantStockQty(product, variant) ?? null,
  };
}

export function orderLineFromCatalog(
  key: string,
  qty: number,
  buyer: OrderBuyer,
): OrderItem | null {
  const { productId, selection } = parseKey(key);
  const product = getProductById(productId);
  if (!product) return null;
  const option = toOption(product, selection, buyer);
  return {
    key,
    title: option.title,
    options: option.options,
    sku: option.sku,
    qty,
    price: option.price,
    sum: Math.round(option.price * qty * 100) / 100,
    url: `/product/${product.slug}/`,
  };
}

export function findOrderVariants(
  query: string,
  buyer: OrderBuyer,
  limit = 20,
): OrderVariantOption[] {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (!tokens.length) return [];

  const found: OrderVariantOption[] = [];
  for (const product of getProducts()) {
    const haystack = normalize(
      [product.title, product.sku ?? "", ...product.optionGroups.flatMap((group) =>
        group.values.map((value) => `${value.label} ${value.sku ?? ""}`),
      )].join(" "),
    );
    if (!tokens.every((token) => haystack.includes(token))) continue;

    const selections = product.optionGroups.length ? allSelections(product) : [{}];
    for (const selection of selections) {
      const option = toOption(product, selection, buyer);
      const text = normalize(`${option.title} ${option.options} ${option.sku ?? ""}`);
      if (tokens.every((token) => text.includes(token))) found.push(option);
      if (found.length >= limit) return found;
    }
  }
  return found;
}
