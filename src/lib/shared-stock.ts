import { getDb } from "./db";
import type { Product } from "./schema";
import { stockedByQty } from "./variant";

export function frameTypeOfSku(sku: string | undefined | null): string {
  return sku?.trim().match(/(\d{3})$/)?.[1] ?? "";
}

export interface StockGroup {
  categoryId: string;
  type: string;
  stockQty: number | null;
}

export function stockGroupOf(productId: string): StockGroup | null {
  const db = getDb();
  const product = db
    .prepare("SELECT category_id AS categoryId, json_extract(data, '$.sku') AS sku FROM products WHERE id = ?")
    .get(productId) as { categoryId: string; sku: string | null } | undefined;
  const type = frameTypeOfSku(product?.sku);
  if (!product || !type) return null;

  const saved = db
    .prepare("SELECT stock_qty AS stockQty FROM frame_types WHERE category_id = ? AND type = ?")
    .get(product.categoryId, type) as { stockQty: number | null } | undefined;
  return saved ? { categoryId: product.categoryId, type, stockQty: saved.stockQty } : null;
}

function groupRows(group: StockGroup): Array<{ id: string; data: string }> {
  return (
    getDb()
      .prepare("SELECT id, data, json_extract(data, '$.sku') AS sku FROM products WHERE category_id = ?")
      .all(group.categoryId) as Array<{ id: string; data: string; sku: string | null }>
  ).filter((row) => frameTypeOfSku(row.sku) === group.type);
}

export function productsSharingStock(productId: string): string[] {
  const group = stockGroupOf(productId);
  return group ? groupRows(group).map((row) => row.id) : [productId];
}

export function setGroupStock(group: StockGroup, qty: number | null): string[] {
  const db = getDb();
  const inStock = stockedByQty(qty);
  const now = Date.now();
  const write = db.prepare("UPDATE products SET in_stock = ?, data = ?, updated_at = ? WHERE id = ?");
  const rows = groupRows(group);

  db.transaction(() => {
    db.prepare(
      "UPDATE frame_types SET stock_qty = ?, in_stock = ?, updated_at = ? WHERE category_id = ? AND type = ?",
    ).run(qty, inStock ? 1 : 0, now, group.categoryId, group.type);

    for (const row of rows) {
      const product = JSON.parse(row.data) as Product;
      if (qty === null) delete product.stockQty;
      else product.stockQty = qty;
      product.inStock = inStock;
      write.run(inStock ? 1 : 0, JSON.stringify(product), now, row.id);
    }
  })();

  return rows.map((row) => row.id);
}
