import { bumpCatalogVersion, getDb } from "./db";
import { deepTrim } from "./text";
import { parseOrThrow, siteSchema, type Site } from "./schema";
import { SaveResult, describe } from "./store";

/* ------------------------------------------------------------------ */
/* Настройки сайта                                                     */
/* ------------------------------------------------------------------ */

export function saveSite(input: unknown): SaveResult {
  const parsed = siteSchema.safeParse(deepTrim(input));
  if (!parsed.success) {
    return { ok: false, problems: describe(parsed.error.issues) };
  }

  const db = getDb();
  const save = db.prepare(
    `INSERT INTO settings (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );

  db.transaction(() => {
    save.run({ key: "site", value: JSON.stringify(parsed.data) });
    // Время правки: по нему в sitemap.xml стоит lastmod у страниц, собранных
    // из настроек — доставки, контактов и «о магазине». Раньше там было
    // время сборки, и каждый деплой врал поиску, что страницы обновились.
    save.run({ key: "site:updated_at", value: String(Date.now()) });
  })();

  bumpCatalogVersion();
  return { ok: true };
}

export function getSiteRaw(): Site | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = 'site'")
    .get() as { value: string } | undefined;
  return row
    ? parseOrThrow(siteSchema, JSON.parse(row.value), "настройки сайта")
    : null;
}
