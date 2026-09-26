import { getDb } from "./db";
import { accessToken, fetchPage } from "./vdf-prices";
import { fetchVdfHtml, htmlToText, nuxtPayload, VDF_ORIGIN, VDF_PAUSE_MS } from "./vdf-frames";
import { writeXlsx, type Cell } from "./xlsx";

export const LIST_BATCH = 4;
export const READ_BATCH = 5;
const LIST_PAUSE_MS = 700;
const TREE_TTL_MS = 60 * 60 * 1000;

export interface VdfCategoryNode {
  slug: string;
  name: string;
  children: VdfCategoryNode[];
}

export interface SheetRow {
  article: string;
  title: string;
  retail: number | null;
  wholesale: number | null;
  brand: string;
  description: string;
  specs: Array<{ name: string; value: string }>;
  images: string[];
  cars: string[];
  mark: string;
  model: string;
  years: string;
  oem: string[];
  side: "" | "левое" | "правое";
  pair: string;
  weight: string;
  sizes: string;
  path: string;
  videos: string[];
  docs: string[];
  remains: number | null;
  url: string;
}

export const SHEET_COLUMNS: Array<{ key: keyof SheetRow; title: string; width: number }> = [
  { key: "article", title: "Артикул", width: 16 },
  { key: "title", title: "Название", width: 40 },
  { key: "retail", title: "Розница, ₽", width: 11 },
  { key: "wholesale", title: "Опт, ₽", width: 11 },
  { key: "brand", title: "Производитель", width: 14 },
  { key: "description", title: "Описание", width: 60 },
  { key: "specs", title: "Характеристики", width: 36 },
  { key: "images", title: "Фото", width: 50 },
  { key: "cars", title: "Автомобили", width: 30 },
  { key: "mark", title: "Марка", width: 12 },
  { key: "model", title: "Модель", width: 14 },
  { key: "years", title: "Годы", width: 11 },
  { key: "oem", title: "OEM-коды", width: 24 },
  { key: "side", title: "Сторона", width: 9 },
  { key: "pair", title: "Парный артикул", width: 16 },
  { key: "weight", title: "Вес, кг", width: 8 },
  { key: "sizes", title: "Габариты", width: 12 },
  { key: "path", title: "Раздел на vdf-light", width: 30 },
  { key: "videos", title: "Видео", width: 30 },
  { key: "docs", title: "Инструкции", width: 30 },
  { key: "remains", title: "Остаток у поставщика", width: 10 },
  { key: "url", title: "Ссылка", width: 36 },
];

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function field(value: Json | undefined, key: string): Json | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value[key] : undefined;
}

function text(value: Json | undefined): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function list(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

function absolute(url: string): string {
  return url ? new URL(url, VDF_ORIGIN).toString() : "";
}

function toNumber(value: Json | undefined): number | null {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(number)
    ? number
    : null;
}

let treeCache: { at: number; tree: VdfCategoryNode[] } | null = null;

export async function vdfCategoryTree(): Promise<VdfCategoryNode[]> {
  if (treeCache && Date.now() - treeCache.at < TREE_TTL_MS) return treeCache.tree;
  const response = await fetch(`${VDF_ORIGIN}/api/categories/tree/`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`vdf-light не отдал список разделов: HTTP ${response.status}`);
  const convert = (node: Json): VdfCategoryNode => ({
    slug: text(field(node, "slug_url")),
    name: text(field(node, "name")),
    children: list(field(node, "children")).map(convert),
  });
  const tree = list((await response.json()) as Json).map(convert);
  treeCache = { at: Date.now(), tree };
  return tree;
}

export async function vdfCategoryCount(slug: string): Promise<number> {
  const payload = nuxtPayload(await fetchVdfHtml(`/catalog/${encodeURIComponent(slug)}`)) as Json;
  const data = field(payload, "data");
  const key = data && typeof data === "object" && !Array.isArray(data)
    ? Object.keys(data).find((name) => name.startsWith("catalog-products-"))
    : undefined;
  return key ? Number(field(field(data, key), "count")) || 0 : 0;
}

function yearsFromTitle(title: string): string {
  const match = title.match(/\((\d{4})\s*[-—–]\s*(\d{4})?\)/);
  return match ? `${match[1]}-${match[2] ?? ""}` : "";
}

export function parseVdfCard(product: Json, url: string): Omit<SheetRow, "wholesale" | "remains"> {
  const title = text(field(product, "name"));
  const specs = list(field(product, "attributes"))
    .map((attribute) => ({
      name: text(field(attribute, "name")).replace(/:\s*$/, ""),
      value: text(field(attribute, "value")),
    }))
    .filter((spec) => spec.name && spec.value);
  const spec = (name: string) => specs.find((item) => item.name === name)?.value ?? "";
  const media = list(field(product, "images"));
  const glass = field(product, "glass_info");
  const side = text(field(glass, "side"));
  const docs = list(field(product, "documentations"))
    .flatMap((doc) =>
      typeof doc === "string"
        ? [doc]
        : Object.values(doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {}).filter(
            (value): value is string => typeof value === "string" && /\.(pdf|docx?|jpe?g|png)$/i.test(value),
          ),
    )
    .map(absolute);

  return {
    article: text(field(product, "article")) || text(field(product, "model_frame")),
    title,
    retail: toNumber(field(field(product, "price"), "retail_price")),
    brand: text(field(field(product, "producer"), "name_producer")),
    description: htmlToText(text(field(product, "description"))),
    specs,
    images: media
      .filter((item) => text(field(item, "media_type")) !== "video")
      .map((item) => absolute(text(field(item, "image"))))
      .filter(Boolean),
    videos: media
      .filter((item) => text(field(item, "media_type")) === "video")
      .map((item) => absolute(text(field(item, "image")) || text(field(item, "video"))))
      .filter(Boolean),
    cars: list(field(product, "compatible_cars")).map(text).filter(Boolean),
    mark: text(field(product, "mark_auto")) || spec("Марка"),
    model: text(field(product, "model_auto")) || spec("Модель"),
    years: text(field(product, "year")) || yearsFromTitle(title),
    oem: list(field(product, "oem_codes")).map(text).filter(Boolean),
    side: side === "left" ? "левое" : side === "right" ? "правое" : "",
    pair: text(field(field(glass, "mirrorGlass"), "article")),
    weight: text(field(product, "weight")),
    sizes: text(field(product, "sizes")),
    path: list(field(field(product, "category"), "path"))
      .map((step) => text(field(step, "name")))
      .filter(Boolean)
      .join(" / "),
    docs,
    url,
  };
}

export interface ExportSummary {
  id: number;
  title: string;
  createdAt: number;
  sourcesPending: number;
  listed: number;
  expected: number;
  read: number;
  errors: number;
  next: string[];
}

interface ListedItem {
  retail: number | null;
  wholesale: number | null;
  remains: number | null;
  name: string;
}

export function createExport(sources: Array<{ slug: string; name: string; count: number }>): number {
  if (!sources.length) throw new Error("Отметьте хотя бы один раздел");
  const db = getDb();
  return db.transaction(() => {
    const id = Number(
      db
        .prepare("INSERT INTO vdf_exports (title, created_at, total) VALUES (?, ?, ?)")
        .run(
          sources.map((source) => source.name).join(", ").slice(0, 300),
          Date.now(),
          sources.reduce((sum, source) => sum + source.count, 0),
        ).lastInsertRowid,
    );
    const add = db.prepare("INSERT OR IGNORE INTO vdf_export_sources (export_id, slug, name) VALUES (?, ?, ?)");
    for (const source of sources) add.run(id, source.slug, source.name);
    return id;
  })();
}

export function exportSummary(id: number): ExportSummary | null {
  const db = getDb();
  const row = db.prepare("SELECT id, title, created_at, total FROM vdf_exports WHERE id = ?").get(id) as
    | { id: number; title: string; created_at: number; total: number }
    | undefined;
  if (!row) return null;
  const counts = db
    .prepare(
      `SELECT COUNT(*) AS listed,
              COALESCE(SUM(status = 'read'), 0) AS read,
              COALESCE(SUM(status = 'error'), 0) AS errors
         FROM vdf_export_items WHERE export_id = ?`,
    )
    .get(id) as { listed: number; read: number; errors: number };
  const pending = db
    .prepare("SELECT name FROM vdf_export_sources WHERE export_id = ? AND done = 0 ORDER BY rowid")
    .all(id) as Array<{ name: string }>;
  const next = pending.length
    ? pending.slice(0, 3).map((source) => source.name)
    : (
        db
          .prepare(
            "SELECT json_extract(listed, '$.name') AS name FROM vdf_export_items WHERE export_id = ? AND status = 'new' ORDER BY position LIMIT 3",
          )
          .all(id) as Array<{ name: string }>
      ).map((item) => item.name);
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    sourcesPending: pending.length,
    listed: counts.listed,
    expected: row.total,
    read: counts.read,
    errors: counts.errors,
    next,
  };
}

export function listExports(): ExportSummary[] {
  return (
    getDb().prepare("SELECT id FROM vdf_exports ORDER BY id DESC LIMIT 30").all() as Array<{ id: number }>
  )
    .map((row) => exportSummary(row.id))
    .filter((summary): summary is ExportSummary => summary !== null);
}

export function deleteExport(id: number): void {
  getDb().prepare("DELETE FROM vdf_exports WHERE id = ?").run(id);
}

export function retryExportErrors(id: number): number {
  return getDb()
    .prepare("UPDATE vdf_export_items SET status = 'new', error = '' WHERE export_id = ? AND status = 'error'")
    .run(id).changes;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function apiUrl(slug: string): string {
  return `${VDF_ORIGIN}/api/products/?category_slug=${encodeURIComponent(slug)}&page=1&page_size=24`;
}

export async function listStep(id: number): Promise<ExportSummary | null> {
  const db = getDb();
  const token = await accessToken();
  const addItem = db.prepare(
    `INSERT OR IGNORE INTO vdf_export_items (export_id, url, position, listed)
     VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM vdf_export_items WHERE export_id = ?), ?)`,
  );
  const advance = db.prepare(
    "UPDATE vdf_export_sources SET next_url = ?, done = ? WHERE export_id = ? AND slug = ?",
  );

  for (let step = 0; step < LIST_BATCH; step += 1) {
    const source = db
      .prepare(
        "SELECT slug, next_url FROM vdf_export_sources WHERE export_id = ? AND done = 0 ORDER BY rowid LIMIT 1",
      )
      .get(id) as { slug: string; next_url: string | null } | undefined;
    if (!source) break;
    if (step > 0) await pause(LIST_PAUSE_MS);

    const page = (await fetchPage(source.next_url ?? apiUrl(source.slug), token)) as Json;
    db.transaction(() => {
      for (const item of list(field(page, "results"))) {
        const url = absolute(text(field(item, "url")));
        if (!url) continue;
        const price = field(item, "price");
        const listed: ListedItem = {
          retail: toNumber(field(price, "retail_price")),
          wholesale: toNumber(field(price, "person_price")),
          remains: toNumber(field(field(item, "quantity"), "remains")),
          name: text(field(item, "name")),
        };
        addItem.run(id, url, id, JSON.stringify(listed));
      }
      const next = text(field(page, "next"));
      const nextUrl = next ? `${VDF_ORIGIN}${new URL(next).pathname}${new URL(next).search}` : null;
      advance.run(nextUrl, nextUrl ? 0 : 1, id, source.slug);
    })();
  }
  return exportSummary(id);
}

export async function readStep(id: number): Promise<ExportSummary | null> {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT url FROM vdf_export_items WHERE export_id = ? AND status = 'new' ORDER BY position LIMIT ?",
    )
    .all(id, READ_BATCH) as Array<{ url: string }>;
  const save = db.prepare(
    "UPDATE vdf_export_items SET card = ?, status = 'read', error = '' WHERE export_id = ? AND url = ?",
  );
  const fail = db.prepare(
    "UPDATE vdf_export_items SET status = 'error', error = ? WHERE export_id = ? AND url = ?",
  );

  for (const [index, { url }] of rows.entries()) {
    if (index > 0) await pause(VDF_PAUSE_MS);
    try {
      const payload = nuxtPayload(await fetchVdfHtml(new URL(url).pathname)) as Json;
      const data = field(payload, "data");
      const key =
        data && typeof data === "object" && !Array.isArray(data)
          ? Object.keys(data).find((name) => name.startsWith("product-"))
          : undefined;
      if (!key) throw new Error("На странице нет карточки товара");
      save.run(JSON.stringify(parseVdfCard(field(data, key) ?? null, url)), id, url);
    } catch (error) {
      fail.run((error as Error).message, id, url);
    }
  }
  return exportSummary(id);
}

function cellOf(row: SheetRow, key: keyof SheetRow): Cell {
  const value = row[key];
  if (key === "specs") return row.specs.map((spec) => `${spec.name}: ${spec.value}`).join("\n");
  if (key === "oem") return row.oem.join(", ");
  if (Array.isArray(value)) return value.join("\n");
  return value as Cell;
}

export function exportXlsx(id: number): { name: string; data: Uint8Array } {
  const db = getDb();
  const head = db.prepare("SELECT title FROM vdf_exports WHERE id = ?").get(id) as
    | { title: string }
    | undefined;
  if (!head) throw new Error("Выгрузка не найдена");
  const items = db
    .prepare(
      "SELECT listed, card FROM vdf_export_items WHERE export_id = ? AND status = 'read' ORDER BY position",
    )
    .all(id) as Array<{ listed: string; card: string }>;

  const rows: Cell[][] = [SHEET_COLUMNS.map((column) => column.title)];
  for (const item of items) {
    const listed = JSON.parse(item.listed) as ListedItem;
    const card = JSON.parse(item.card) as Omit<SheetRow, "wholesale" | "remains">;
    const row: SheetRow = {
      ...card,
      retail: card.retail ?? listed.retail,
      wholesale: listed.wholesale,
      remains: listed.remains,
    };
    rows.push(SHEET_COLUMNS.map((column) => cellOf(row, column.key)));
  }
  const slug = head.title
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return {
    name: `vdf-${id}-${slug || "tovary"}.xlsx`,
    data: writeXlsx(
      rows,
      SHEET_COLUMNS.map((column) => column.width),
    ),
  };
}
