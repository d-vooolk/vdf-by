import { getDb } from "./db";
import { toSlug } from "./slug.mjs";

export function freeIdentity(title: string, article: string): string {
  const db = getDb();
  const taken = (value: string) =>
    Boolean(db.prepare("SELECT 1 FROM products WHERE id = ? OR slug = ?").get(value, value));
  const base = toSlug(title) || toSlug(article);
  if (!taken(base)) return base;
  const suffix = toSlug(article);
  const combined = `${base.slice(0, Math.max(1, 80 - suffix.length - 1)).replace(/-+$/, "")}-${suffix}`;
  if (!taken(combined)) return combined;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${combined.slice(0, 76)}-${index}`;
    if (!taken(candidate)) return candidate;
  }
  throw new Error(`Не удалось подобрать свободный адрес для «${title}»`);
}
