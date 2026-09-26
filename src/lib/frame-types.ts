import type { MoneySource } from "./currency";
import { bumpCatalogVersion, getDb } from "./db";
import { moneySourceSchema, type Product } from "./schema";
import { listCategoriesBrief } from "./store";
import { stockedByQty } from "./variant";

export interface FrameTypeValues {
  costPrice: number | null;
  price: number | null;
  wholesalePrice: number | null;
  stockQty: number | null;
  inStock: boolean;
  priceSource: MoneySource | null;
  costSource: MoneySource | null;
  wholesaleSource: MoneySource | null;
}

export interface FrameTypeProduct {
  id: string;
  slug: string;
  title: string;
  sku: string;
  price: number;
  costPrice: number | null;
  wholesalePrice: number | null;
  stockQty: number | null;
  inStock: boolean;
  priceSource: MoneySource | null;
  costSource: MoneySource | null;
  wholesaleSource: MoneySource | null;
}

export interface FrameTypeGroup {
  type: string;
  saved: FrameTypeValues | null;
  products: FrameTypeProduct[];
  uniform: boolean;
}

export function frameTypeOfSku(sku: string | undefined): string {
  return sku?.trim().match(/(\d{3})$/)?.[1] ?? "";
}

interface TypeRow {
  type: string;
  cost_price: number | null;
  price: number | null;
  wholesale_price: number | null;
  stock_qty: number | null;
  in_stock: number;
  price_source: string | null;
  cost_source: string | null;
  wholesale_source: string | null;
}

function parseSource(raw: string | null): MoneySource | null {
  return raw ? (JSON.parse(raw) as MoneySource) : null;
}

function toValues(row: TypeRow): FrameTypeValues {
  return {
    costPrice: row.cost_price,
    price: row.price,
    wholesalePrice: row.wholesale_price,
    stockQty: row.stock_qty,
    inStock: stockedByQty(row.stock_qty),
    priceSource: parseSource(row.price_source),
    costSource: parseSource(row.cost_source),
    wholesaleSource: parseSource(row.wholesale_source),
  };
}

function productValues(product: FrameTypeProduct): FrameTypeValues {
  return {
    costPrice: product.costPrice,
    price: product.price > 0 ? product.price : null,
    wholesalePrice: product.wholesalePrice,
    stockQty: product.stockQty,
    inStock: product.inStock,
    priceSource: product.priceSource,
    costSource: product.costSource,
    wholesaleSource: product.wholesaleSource,
  };
}

function sameValues(a: FrameTypeValues, b: FrameTypeValues): boolean {
  return (
    a.costPrice === b.costPrice &&
    a.price === b.price &&
    a.wholesalePrice === b.wholesalePrice &&
    a.stockQty === b.stockQty &&
    a.inStock === b.inStock &&
    JSON.stringify([a.priceSource, a.costSource, a.wholesaleSource]) ===
      JSON.stringify([b.priceSource, b.costSource, b.wholesaleSource])
  );
}

export function listFrameTypes(categoryId: string): FrameTypeGroup[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, slug, title, price, in_stock, data FROM products WHERE category_id = ?")
    .all(categoryId) as Array<{
    id: string;
    slug: string;
    title: string;
    price: number;
    in_stock: number;
    data: string;
  }>;
  const saved = new Map(
    (
      db.prepare("SELECT * FROM frame_types WHERE category_id = ?").all(categoryId) as TypeRow[]
    ).map((row) => [row.type, toValues(row)]),
  );

  const groups = new Map<string, FrameTypeProduct[]>();
  for (const row of rows) {
    const data = JSON.parse(row.data) as Partial<Product>;
    const type = frameTypeOfSku(data.sku);
    if (!type) continue;
    const list = groups.get(type) ?? [];
    list.push({
      id: row.id,
      slug: row.slug,
      title: row.title,
      sku: data.sku ?? "",
      price: row.price,
      costPrice: data.costPrice ?? null,
      wholesalePrice: data.wholesalePrice ?? null,
      stockQty: data.stockQty ?? null,
      inStock: row.in_stock === 1,
      priceSource: data.priceSource ?? null,
      costSource: data.costSource ?? null,
      wholesaleSource: data.wholesaleSource ?? null,
    });
    groups.set(type, list);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, products]) => {
      const first = productValues(products[0]);
      return {
        type,
        saved: saved.get(type) ?? null,
        products: products.sort((a, b) => a.title.localeCompare(b.title, "ru")),
        uniform: products.every((product) => sameValues(productValues(product), first)),
      };
    });
}

export function savedFrameType(categoryId: string, type: string): FrameTypeValues | null {
  const row = getDb()
    .prepare("SELECT * FROM frame_types WHERE category_id = ? AND type = ?")
    .get(categoryId, type) as TypeRow | undefined;
  return row ? toValues(row) : null;
}

export function validFrameTypeValues(input: unknown): FrameTypeValues | string {
  const value = (input ?? {}) as Record<string, unknown>;
  const money = (raw: unknown, name: string): number | null | string => {
    if (raw === null || raw === undefined || raw === "") return null;
    const number = Number(raw);
    return Number.isFinite(number) && number >= 0 ? number : `${name}: нужно число не меньше нуля`;
  };
  const costPrice = money(value.costPrice, "Себестоимость");
  const price = money(value.price, "Цена");
  const wholesalePrice = money(value.wholesalePrice, "Оптовая цена");
  const stockRaw = value.stockQty;
  const stockQty =
    stockRaw === null || stockRaw === undefined || stockRaw === ""
      ? null
      : Number.isInteger(Number(stockRaw)) && Number(stockRaw) >= 0
        ? Number(stockRaw)
        : "Остаток: нужно целое число не меньше нуля";
  for (const item of [costPrice, price, wholesalePrice, stockQty]) {
    if (typeof item === "string") return item;
  }
  const source = (raw: unknown): MoneySource | null | string => {
    if (raw === null || raw === undefined) return null;
    const parsed = moneySourceSchema.safeParse(raw);
    return parsed.success ? parsed.data : "Сумма в валюте указана неверно";
  };
  const priceSource = source(value.priceSource);
  const costSource = source(value.costSource);
  const wholesaleSource = source(value.wholesaleSource);
  for (const item of [priceSource, costSource, wholesaleSource]) {
    if (typeof item === "string") return item;
  }
  return {
    costPrice: costPrice as number | null,
    price: price as number | null,
    wholesalePrice: wholesalePrice as number | null,
    stockQty: stockQty as number | null,
    inStock: stockedByQty(stockQty as number | null),
    priceSource: priceSource as MoneySource | null,
    costSource: costSource as MoneySource | null,
    wholesaleSource: wholesaleSource as MoneySource | null,
  };
}

function writeValues(product: Product, values: FrameTypeValues): Product {
  const next: Product = {
    ...product,
    price: values.price ?? 0,
    inStock: stockedByQty(values.stockQty),
  };
  for (const key of ["priceSource", "costSource", "wholesaleSource"] as const) {
    const source = values[key];
    if (source) next[key] = source;
    else delete next[key];
  }
  if (values.costPrice === null) delete next.costPrice;
  else next.costPrice = values.costPrice;
  if (values.wholesalePrice === null) delete next.wholesalePrice;
  else next.wholesalePrice = values.wholesalePrice;
  if (values.stockQty === null) delete next.stockQty;
  else next.stockQty = values.stockQty;
  return next;
}

export function applyToProduct(productId: string, values: FrameTypeValues): void {
  const db = getDb();
  const row = db.prepare("SELECT data FROM products WHERE id = ?").get(productId) as
    | { data: string }
    | undefined;
  if (!row) return;
  const next = writeValues(JSON.parse(row.data) as Product, values);
  db.prepare(
    "UPDATE products SET price = ?, in_stock = ?, data = ?, updated_at = ? WHERE id = ?",
  ).run(next.price, next.inStock ? 1 : 0, JSON.stringify(next), Date.now(), productId);
}

export function applyFrameType(
  categoryId: string,
  type: string,
  values: FrameTypeValues,
): number {
  const db = getDb();
  const products =
    listFrameTypes(categoryId).find((group) => group.type === type)?.products ?? [];

  db.transaction(() => {
    db.prepare(
      `INSERT INTO frame_types
         (category_id, type, cost_price, price, wholesale_price, stock_qty, in_stock,
          price_source, cost_source, wholesale_source, updated_at)
       VALUES (@categoryId, @type, @costPrice, @price, @wholesalePrice, @stockQty, @inStock,
          @priceSource, @costSource, @wholesaleSource, @now)
       ON CONFLICT(category_id, type) DO UPDATE SET
         cost_price = excluded.cost_price, price = excluded.price,
         wholesale_price = excluded.wholesale_price, stock_qty = excluded.stock_qty,
         in_stock = excluded.in_stock, price_source = excluded.price_source,
         cost_source = excluded.cost_source, wholesale_source = excluded.wholesale_source,
         updated_at = excluded.updated_at`,
    ).run({
      categoryId,
      type,
      ...values,
      inStock: values.inStock ? 1 : 0,
      priceSource: values.priceSource ? JSON.stringify(values.priceSource) : null,
      costSource: values.costSource ? JSON.stringify(values.costSource) : null,
      wholesaleSource: values.wholesaleSource ? JSON.stringify(values.wholesaleSource) : null,
      now: Date.now(),
    });
    for (const product of products) applyToProduct(product.id, values);
  })();

  bumpCatalogVersion();
  return products.length;
}

export function frameCategories() {
  return listCategoriesBrief()
    .filter((category) => category.carFitment && category.children === 0)
    .map((category) => ({ id: category.id, name: category.name }));
}

export function defaultFrameCategory(categories: Array<{ id: string; name: string }>): string {
  return categories.find((category) => /рамк/i.test(category.name))?.id ?? categories[0]?.id ?? "";
}
