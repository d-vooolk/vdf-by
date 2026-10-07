import { getDb } from "./db";

export const POPULAR_DAYS = 30;
const KEEP_DAYS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

let prunedDay = "";

export function dayKey(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function recordProductView(productId: string): boolean {
  const db = getDb();
  const today = dayKey(Date.now());
  const result = db
    .prepare(
      `INSERT INTO product_views (product_id, day, views)
       SELECT id, ?, 1 FROM products WHERE id = ?
       ON CONFLICT(product_id, day) DO UPDATE SET views = views + 1`,
    )
    .run(today, productId);

  if (prunedDay !== today) {
    prunedDay = today;
    db.prepare("DELETE FROM product_views WHERE day < ?").run(dayKey(Date.now() - KEEP_DAYS * DAY_MS));
  }
  return result.changes > 0;
}

export function popularProductIds(limit: number, days = POPULAR_DAYS): string[] {
  return (
    getDb()
      .prepare(
        `SELECT product_id AS id FROM product_views
          WHERE day >= ?
          GROUP BY product_id
          ORDER BY SUM(views) DESC, MAX(day) DESC
          LIMIT ?`,
      )
      .all(dayKey(Date.now() - days * DAY_MS), limit) as Array<{ id: string }>
  ).map((row) => row.id);
}

export function newestProductIds(limit: number): string[] {
  return (
    getDb()
      .prepare("SELECT id FROM products ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(limit) as Array<{ id: string }>
  ).map((row) => row.id);
}
