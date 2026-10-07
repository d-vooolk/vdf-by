import { getDb } from "./db";

export interface CarText {
  text: string;
  updatedAt: number;
}

export function getCarText(categoryId: string, modelId: string): CarText | undefined {
  return getDb()
    .prepare("SELECT text, updated_at AS updatedAt FROM car_texts WHERE category_id = ? AND model_id = ?")
    .get(categoryId, modelId) as CarText | undefined;
}

export function listCarTexts(categoryId: string): Map<string, CarText> {
  const rows = getDb()
    .prepare("SELECT model_id AS modelId, text, updated_at AS updatedAt FROM car_texts WHERE category_id = ?")
    .all(categoryId) as Array<CarText & { modelId: string }>;
  return new Map(rows.map(({ modelId, ...entry }) => [modelId, entry]));
}

export function normalizeCarText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

export function carTextParagraphs(text: string): string[] {
  return text.split("\n\n").filter(Boolean);
}

export function saveCarText(categoryId: string, modelId: string, text: string): void {
  const value = normalizeCarText(text);
  const db = getDb();
  if (!value) {
    db.prepare("DELETE FROM car_texts WHERE category_id = ? AND model_id = ?").run(categoryId, modelId);
    return;
  }
  db.prepare(
    `INSERT INTO car_texts (category_id, model_id, text, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (category_id, model_id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
  ).run(categoryId, modelId, value, Date.now());
}
