import { getDb } from "./db";
import type { OrderItem } from "./order-types";
import { productViewCounts } from "./product-views";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CheckStats {
  orders: number;
  average: number;
  previousAverage: number;
  wholesaleOrders: number;
  wholesaleRevenueShare: number;
}

interface CheckRow {
  created_at: number;
  total: number;
  wholesale: number;
}

export function checkStats(days = 30): CheckStats {
  const now = Date.now();
  const rows = getDb()
    .prepare(
      "SELECT created_at, total, wholesale FROM orders WHERE created_at >= ? AND staff = 0 AND status != 'cancelled'",
    )
    .all(now - 2 * days * DAY_MS) as CheckRow[];
  const since = now - days * DAY_MS;
  const current = rows.filter((row) => row.created_at >= since);
  const previous = rows.filter((row) => row.created_at < since);
  const sum = (list: CheckRow[]) => list.reduce((total, row) => total + row.total, 0);
  const average = (list: CheckRow[]) => (list.length ? sum(list) / list.length : 0);
  const wholesale = current.filter((row) => row.wholesale === 1);
  const revenue = sum(current);

  return {
    orders: current.length,
    average: average(current),
    previousAverage: average(previous),
    wholesaleOrders: wholesale.length,
    wholesaleRevenueShare: revenue ? sum(wholesale) / revenue : 0,
  };
}

function soldQuantities(days: number): Map<string, number> {
  const rows = getDb()
    .prepare("SELECT items FROM orders WHERE created_at >= ? AND staff = 0 AND status != 'cancelled'")
    .all(Date.now() - days * DAY_MS) as Array<{ items: string }>;
  const sold = new Map<string, number>();
  for (const row of rows) {
    for (const item of JSON.parse(row.items) as OrderItem[]) {
      const productId = item.key.split("|")[0];
      if (productId) sold.set(productId, (sold.get(productId) ?? 0) + item.qty);
    }
  }
  return sold;
}

interface ProductBrief {
  id: string;
  title: string;
  price: number;
}

function productsByStock(inStock: boolean): ProductBrief[] {
  return getDb()
    .prepare("SELECT id, title, price FROM products WHERE in_stock = ?")
    .all(inStock ? 1 : 0) as ProductBrief[];
}

export interface RestockRow extends ProductBrief {
  waiting: number;
  sold: number;
  views: number;
}

export const RESTOCK_SOLD_DAYS = 90;
export const VIEWS_DAYS = 30;

export function restockCandidates(limit = 10): RestockRow[] {
  const waiting = new Map(
    (
      getDb()
        .prepare("SELECT product_id AS id, SUM(qty) AS qty FROM waitlist WHERE status = 'waiting' AND product_id IS NOT NULL GROUP BY product_id")
        .all() as Array<{ id: string; qty: number }>
    ).map((row) => [row.id, row.qty]),
  );
  const sold = soldQuantities(RESTOCK_SOLD_DAYS);
  const views = productViewCounts(VIEWS_DAYS);
  const score = (row: RestockRow) => row.waiting * 20 + row.sold * 5 + row.views;

  return productsByStock(false)
    .map((product) => ({
      ...product,
      waiting: waiting.get(product.id) ?? 0,
      sold: sold.get(product.id) ?? 0,
      views: views.get(product.id) ?? 0,
    }))
    .filter((row) => score(row) > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

export interface ViewedRow extends ProductBrief {
  views: number;
}

export interface ViewedNotBought {
  rows: ViewedRow[];
  viewsPerOrder: number | null;
}

export function viewedNotBought(limit = 10): ViewedNotBought {
  const views = productViewCounts(VIEWS_DAYS);
  const sold = soldQuantities(VIEWS_DAYS);
  const orders = (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM orders WHERE created_at >= ? AND staff = 0 AND status != 'cancelled'")
      .get(Date.now() - VIEWS_DAYS * DAY_MS) as { n: number }
  ).n;
  const totalViews = [...views.values()].reduce((sum, value) => sum + value, 0);

  const rows = productsByStock(true)
    .filter((product) => !sold.has(product.id))
    .map((product) => ({ ...product, views: views.get(product.id) ?? 0 }))
    .filter((row) => row.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);

  return { rows, viewsPerOrder: orders ? totalViews / orders : null };
}

export interface ServiceStats {
  week: number;
  previousWeek: number;
  open: number;
}

export function serviceStats(): ServiceStats {
  const now = Date.now();
  const row = getDb()
    .prepare(
      `SELECT SUM(created_at >= ?) AS week,
              SUM(created_at >= ? AND created_at < ?) AS previousWeek,
              SUM(done = 0) AS open
         FROM service_requests`,
    )
    .get(now - 7 * DAY_MS, now - 14 * DAY_MS, now - 7 * DAY_MS) as { week: number | null; previousWeek: number | null; open: number | null };
  return { week: row.week ?? 0, previousWeek: row.previousWeek ?? 0, open: row.open ?? 0 };
}
