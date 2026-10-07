import { getDb } from "./db";
import { productSchema, type Product } from "./schema";
import { allSelections, resolveVariant, type ResolvedVariant, type Selection } from "./variant";

export type WholesaleList = Record<string, number>;

function roundMoney(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100);
}

function derivedFrom(
  product: Product,
  base: number | null | undefined,
  variant: ResolvedVariant,
): number | null {
  if (!base || base <= 0) return null;
  const difference =
    product.price > 0
      ? variant.price - product.price
      : variant.selected.reduce((sum, entry) => sum + (entry.value.priceDelta ?? 0), 0);
  return roundMoney(base + difference);
}

export function wholesaleFor(product: Product, selection: Selection): number | null {
  const variant = resolveVariant(product, selection);
  const own = variant.selected.find((entry) => (entry.value.wholesalePrice ?? 0) > 0)?.value
    .wholesalePrice;
  if (own === undefined) return derivedFrom(product, product.wholesalePrice, variant);
  const delta = variant.selected.reduce((sum, entry) => sum + (entry.value.priceDelta ?? 0), 0);
  return roundMoney(own + delta);
}

export function costFor(product: Product, selection: Selection): number | null {
  return derivedFrom(product, product.costPrice, resolveVariant(product, selection));
}

function buildSpecialList(
  filter: string,
  priceFor: (product: Product, selection: Selection) => number | null,
): WholesaleList {
  const rows = getDb().prepare(`SELECT data FROM products WHERE ${filter}`).all() as Array<{
    data: string;
  }>;
  const list: WholesaleList = {};
  for (const row of rows) {
    const parsed = productSchema.safeParse(JSON.parse(row.data));
    if (!parsed.success) continue;
    const product = parsed.data;
    const selections = product.optionGroups.length ? allSelections(product) : [{}];
    for (const selection of selections) {
      const price = priceFor(product, selection);
      if (price !== null) list[resolveVariant(product, selection).key] = price;
    }
  }
  return list;
}

export function buildWholesaleList(): WholesaleList {
  return buildSpecialList(
    `COALESCE(json_extract(data, '$.wholesalePrice'), 0) > 0 OR data LIKE '%"wholesalePrice"%'`,
    wholesaleFor,
  );
}

export function buildCostList(): WholesaleList {
  return buildSpecialList(`COALESCE(json_extract(data, '$.costPrice'), 0) > 0`, costFor);
}

export function buildStaffList(): WholesaleList {
  return { ...buildWholesaleList(), ...buildCostList() };
}
