import { getDb } from "./db";

export interface FrameCategory {
  id: string;
  name: string;
}

export function frameCategories(): FrameCategory[] {
  return getDb()
    .prepare(
      `SELECT c.id, c.name FROM categories c
        WHERE COALESCE(json_extract(c.data, '$.frameTypes'), 0) = 1
          AND COALESCE(json_extract(c.data, '$.carFitment'), 0) = 1
          AND NOT EXISTS (SELECT 1 FROM categories k WHERE k.parent_id = c.id)
        ORDER BY c.sort_order, c.name`,
    )
    .all() as FrameCategory[];
}

export function isFrameCategory(categoryId: string): boolean {
  return frameCategories().some((category) => category.id === categoryId);
}
