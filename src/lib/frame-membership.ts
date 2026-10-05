import { getDb } from "./db";
import { frameCategories } from "./frame-category";
import { splitFrameSku } from "./frame-sku";
import type { Spec } from "./schema";

const BACKFILL_KEY = "frame_membership_backfill";

export const FRAME_TYPE_SPEC = "Тип рамки";

export interface FrameMembership {
  categoryId: string;
  type: string;
}

let backfilled = false;

export function ensureFrameMembership(): void {
  if (backfilled) return;
  const db = getDb();
  const done = db.prepare("SELECT 1 FROM settings WHERE key = ?").get(BACKFILL_KEY);
  if (!done) {
    const insert = db.prepare(
      "INSERT OR IGNORE INTO frame_type_products (product_id, category_id, type) VALUES (?, ?, ?)",
    );
    db.transaction(() => {
      for (const category of frameCategories()) {
        const rows = db
          .prepare("SELECT id, json_extract(data, '$.sku') AS sku FROM products WHERE category_id = ?")
          .all(category.id) as Array<{ id: string; sku: string | null }>;
        for (const row of rows) {
          const { type } = splitFrameSku(row.sku);
          if (type) insert.run(row.id, category.id, type);
        }
      }
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(BACKFILL_KEY, String(Date.now()));
    })();
  }
  backfilled = true;
}

export function frameMembershipOf(productId: string): FrameMembership | null {
  ensureFrameMembership();
  const row = getDb()
    .prepare("SELECT category_id AS categoryId, type FROM frame_type_products WHERE product_id = ?")
    .get(productId) as FrameMembership | undefined;
  return row ?? null;
}

export function frameMembers(categoryId: string, type: string): string[] {
  ensureFrameMembership();
  return (
    getDb()
      .prepare("SELECT product_id AS id FROM frame_type_products WHERE category_id = ? AND type = ?")
      .all(categoryId, type) as Array<{ id: string }>
  ).map((row) => row.id);
}

export function frameMembershipsIn(categoryId: string): Map<string, string> {
  ensureFrameMembership();
  const rows = getDb()
    .prepare("SELECT product_id AS id, type FROM frame_type_products WHERE category_id = ?")
    .all(categoryId) as Array<{ id: string; type: string }>;
  return new Map(rows.map((row) => [row.id, row.type]));
}

export function frameTypesByProduct(): Map<string, string> {
  ensureFrameMembership();
  const rows = getDb().prepare("SELECT product_id AS id, type FROM frame_type_products").all() as Array<{
    id: string;
    type: string;
  }>;
  return new Map(rows.map((row) => [row.id, row.type]));
}

export function specsWithFrameType(specs: Spec[], type: string | undefined): Spec[] {
  if (!type || specs.some((spec) => spec.name === FRAME_TYPE_SPEC)) return specs;
  return [{ name: FRAME_TYPE_SPEC, value: type }, ...specs];
}

export function setFrameMembership(productId: string, membership: FrameMembership | null): void {
  ensureFrameMembership();
  const db = getDb();
  if (!membership) {
    db.prepare("DELETE FROM frame_type_products WHERE product_id = ?").run(productId);
    return;
  }
  db.prepare(
    `INSERT INTO frame_type_products (product_id, category_id, type) VALUES (?, ?, ?)
     ON CONFLICT(product_id) DO UPDATE SET category_id = excluded.category_id, type = excluded.type`,
  ).run(productId, membership.categoryId, membership.type);
}

export function renameFrameMembers(categoryId: string, from: string, to: string): void {
  ensureFrameMembership();
  getDb()
    .prepare("UPDATE frame_type_products SET type = ? WHERE category_id = ? AND type = ?")
    .run(to, categoryId, from);
}
