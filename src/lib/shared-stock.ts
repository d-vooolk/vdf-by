import { getDb } from "./db";
import { isFrameCategory } from "./frame-category";
import { frameMembers, frameMembershipOf } from "./frame-membership";
import type { Product } from "./schema";
import { stockedByQty } from "./variant";

export interface StockGroup {
  categoryId: string;
  type: string;
  stockQty: number | null;
}

export function stockGroupOf(productId: string): StockGroup | null {
  const membership = frameMembershipOf(productId);
  if (!membership || !isFrameCategory(membership.categoryId)) return null;

  const saved = getDb()
    .prepare("SELECT stock_qty AS stockQty FROM frame_types WHERE category_id = ? AND type = ?")
    .get(membership.categoryId, membership.type) as { stockQty: number | null } | undefined;
  return saved ? { ...membership, stockQty: saved.stockQty } : null;
}

function groupRows(group: StockGroup): Array<{ id: string; data: string }> {
  const ids = frameMembers(group.categoryId, group.type);
  if (!ids.length) return [];
  return getDb()
    .prepare(`SELECT id, data FROM products WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as Array<{ id: string; data: string }>;
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
