import { bumpCatalogVersion, getDb } from "./db";
import { type Product } from "./schema";
import { setGroupStock, stockGroupOf } from "./shared-stock";
import {
  applyOptionStock,
  countedOptionGroupIndex,
  stockedByQty,
  type Selection,
} from "./variant";

export interface StockMove {
  productId: string;
  qty: number;
  selection?: Selection;
}

export function takeFromStock(wanted: StockMove[]): StockMove[] {
  return moveStock(wanted, -1);
}

export function returnToStock(moves: StockMove[]): StockMove[] {
  return moveStock(moves, 1);
}

export function moveStock(moves: StockMove[], direction: 1 | -1): StockMove[] {
  const db = getDb();
  const read = db.prepare("SELECT data FROM products WHERE id = ?");
  const write = db.prepare(
    "UPDATE products SET in_stock = ?, data = ?, updated_at = ? WHERE id = ?",
  );
  const done: StockMove[] = [];

  for (const { productId, qty, selection } of moves) {
    const row = read.get(productId) as { data: string } | undefined;
    if (!row || qty <= 0) continue;

    const stored = JSON.parse(row.data) as Product;
    const countedIndex = countedOptionGroupIndex({ optionGroups: stored.optionGroups ?? [] });
    if (countedIndex !== -1) {
      const group = stored.optionGroups[countedIndex];
      const value = group.values.find((entry) => entry.id === selection?.[group.id]);
      if (!value) continue;
      const before = value.stockQty ?? 0;
      const moved = direction === -1 ? Math.min(before, qty) : qty;
      if (moved === 0) continue;
      value.stockQty = before + direction * moved;
      const product = applyOptionStock(stored);
      write.run(product.inStock ? 1 : 0, JSON.stringify(product), Date.now(), productId);
      done.push({ productId, qty: moved, selection });
      continue;
    }

    const group = stockGroupOf(productId);
    if (group) {
      const stock = group.stockQty ?? 0;
      const shared = direction === -1 ? Math.min(stock, qty) : qty;
      if (shared === 0) continue;
      setGroupStock(group, stock + direction * shared);
      done.push({ productId, qty: shared });
      continue;
    }

    const product = JSON.parse(row.data) as Product;
    const before = product.stockQty ?? 0;
    const moved = direction === -1 ? Math.min(before, qty) : qty;
    if (moved === 0) continue;
    product.stockQty = before + direction * moved;
    product.inStock = stockedByQty(product.stockQty);
    write.run(product.inStock ? 1 : 0, JSON.stringify(product), Date.now(), productId);
    done.push({ productId, qty: moved });
  }

  if (done.length) bumpCatalogVersion();
  return done;
}
