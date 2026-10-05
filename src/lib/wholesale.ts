import { getDb } from "./db";
import { productSchema, type Product } from "./schema";
import { allSelections, resolveVariant, type Selection } from "./variant";

export type WholesaleList = Record<string, number>;

export function wholesaleFor(
  product: Product,
  wholesalePrice: number | null | undefined,
  selection: Selection,
): number | null {
  if (!wholesalePrice || wholesalePrice <= 0) return null;
  const variant = resolveVariant(product, selection);
  const difference =
    product.price > 0
      ? variant.price - product.price
      : variant.selected.reduce((sum, entry) => sum + (entry.value.priceDelta ?? 0), 0);
  return Math.max(0, Math.round((wholesalePrice + difference) * 100) / 100);
}

type SpecialPriceField = "wholesalePrice" | "costPrice";

function buildSpecialList(field: SpecialPriceField): WholesaleList {
  const rows = getDb()
    .prepare(`SELECT data FROM products WHERE COALESCE(json_extract(data, '$.${field}'), 0) > 0`)
    .all() as Array<{ data: string }>;
  const list: WholesaleList = {};
  for (const row of rows) {
    const parsed = productSchema.safeParse(JSON.parse(row.data));
    if (!parsed.success) continue;
    const product = parsed.data;
    const selections = product.optionGroups.length ? allSelections(product) : [{}];
    for (const selection of selections) {
      const price = wholesaleFor(product, product[field], selection);
      if (price !== null) list[resolveVariant(product, selection).key] = price;
    }
  }
  return list;
}

export function buildWholesaleList(): WholesaleList {
  return buildSpecialList("wholesalePrice");
}

export function buildCostList(): WholesaleList {
  return buildSpecialList("costPrice");
}

export function buildStaffList(): WholesaleList {
  return { ...buildWholesaleList(), ...buildCostList() };
}
