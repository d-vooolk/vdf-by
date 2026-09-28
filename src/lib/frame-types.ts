import { parseComposerSettings, type ComposerSettings } from "./composer";
import type { MoneySource } from "./currency";
import { bumpCatalogVersion, getDb } from "./db";
import { frameCategories, isFrameCategory, type FrameCategory } from "./frame-category";
import {
  buildFrameSku,
  isFrameSuffix,
  isFrameType,
  normalizeFrameSuffix,
  normalizeFrameType,
  splitFrameSku,
} from "./frame-sku";
import { moneySourceSchema, type Product, type Spec } from "./schema";
import { frameMembershipsIn, renameFrameMembers, setFrameMembership } from "./frame-membership";
import { setGroupStock } from "./shared-stock";
import { nextSku } from "./store";
import { stockedByQty } from "./variant";

export interface FrameTypeValues {
  costPrice: number | null;
  price: number | null;
  wholesalePrice: number | null;
  stockQty: number | null;
  inStock: boolean;
  priceSource: MoneySource | null;
  costSource: MoneySource | null;
  wholesaleSource: MoneySource | null;
}

export interface FrameTypeProduct {
  id: string;
  slug: string;
  title: string;
  sku: string;
  price: number;
  costPrice: number | null;
  wholesalePrice: number | null;
  stockQty: number | null;
  inStock: boolean;
  priceSource: MoneySource | null;
  costSource: MoneySource | null;
  wholesaleSource: MoneySource | null;
  storageCode: string;
}

export interface FrameTypeGroup {
  type: string;
  name: string;
  suffix: string;
  storageCode: string;
  storageMixed: boolean;
  brief: string;
  specs: Spec[];
  titleTemplate: string;
  saved: FrameTypeValues | null;
  products: FrameTypeProduct[];
  uniform: boolean;
  hasFrameImage: boolean;
  composer: ComposerSettings | null;
}

export interface FrameTypeInfo {
  type: string;
  suffix: string;
  name: string;
  storageCode: string;
  brief: string;
  specs: Spec[];
  titleTemplate: string;
}

export const DEFAULT_TITLE_TEMPLATE = "Рамки для замены линз в фарах {марка} {модель} {кузов} {годы}";

export type FrameTypeResult = { ok: true; productIds: string[] } | { ok: false; problems: string[] };

export { frameCategories, isFrameCategory };

interface TypeRow {
  type: string;
  name: string;
  suffix: string | null;
  storage_code: string | null;
  brief: string;
  specs: string;
  title_template: string;
  cost_price: number | null;
  price: number | null;
  wholesale_price: number | null;
  stock_qty: number | null;
  in_stock: number;
  price_source: string | null;
  cost_source: string | null;
  wholesale_source: string | null;
  has_frame_image: number;
  composer: string | null;
}

const TYPE_COLUMNS = `type, name, suffix, storage_code, brief, specs, title_template, cost_price, price, wholesale_price, stock_qty, in_stock,
  price_source, cost_source, wholesale_source, frame_image IS NOT NULL AS has_frame_image, composer`;

const EMPTY_VALUES: FrameTypeValues = {
  costPrice: null,
  price: null,
  wholesalePrice: null,
  stockQty: null,
  inStock: false,
  priceSource: null,
  costSource: null,
  wholesaleSource: null,
};

function parseSource(raw: string | null): MoneySource | null {
  return raw ? (JSON.parse(raw) as MoneySource) : null;
}

function toValues(row: TypeRow): FrameTypeValues {
  return {
    costPrice: row.cost_price,
    price: row.price,
    wholesalePrice: row.wholesale_price,
    stockQty: row.stock_qty,
    inStock: stockedByQty(row.stock_qty),
    priceSource: parseSource(row.price_source),
    costSource: parseSource(row.cost_source),
    wholesaleSource: parseSource(row.wholesale_source),
  };
}

function productValues(product: FrameTypeProduct): FrameTypeValues {
  return {
    costPrice: product.costPrice,
    price: product.price > 0 ? product.price : null,
    wholesalePrice: product.wholesalePrice,
    stockQty: product.stockQty,
    inStock: product.inStock,
    priceSource: product.priceSource,
    costSource: product.costSource,
    wholesaleSource: product.wholesaleSource,
  };
}

function sameValues(a: FrameTypeValues, b: FrameTypeValues): boolean {
  return (
    a.costPrice === b.costPrice &&
    a.price === b.price &&
    a.wholesalePrice === b.wholesalePrice &&
    a.stockQty === b.stockQty &&
    a.inStock === b.inStock &&
    JSON.stringify([a.priceSource, a.costSource, a.wholesaleSource]) ===
      JSON.stringify([b.priceSource, b.costSource, b.wholesaleSource])
  );
}

function parseSpecs(raw: string): Spec[] {
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? cleanSpecs(list) : [];
  } catch {
    return [];
  }
}

function cleanSpecs(list: unknown[]): Spec[] {
  return list
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      name: String(item?.name ?? "").trim().slice(0, 100),
      value: String(item?.value ?? "").trim().slice(0, 300),
    }))
    .filter((spec) => spec.name && spec.value)
    .slice(0, 40);
}

function commonValue(products: FrameTypeProduct[], read: (product: FrameTypeProduct) => string): string {
  const values = new Set(products.map(read));
  return values.size === 1 ? [...values][0] : "";
}

function mostCommon<T>(items: T[]): T {
  const counts = new Map<string, { item: T; count: number }>();
  for (const item of items) {
    const key = JSON.stringify(item);
    const entry = counts.get(key) ?? { item, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0].item;
}

function prevailingValues(products: FrameTypeProduct[]): FrameTypeValues {
  const values = products.map(productValues);
  const pick = <K extends keyof FrameTypeValues>(key: K) => mostCommon(values.map((value) => value[key]));
  const stockQty = pick("stockQty");
  return {
    costPrice: pick("costPrice"),
    price: pick("price"),
    wholesalePrice: pick("wholesalePrice"),
    stockQty,
    inStock: stockedByQty(stockQty),
    priceSource: pick("priceSource"),
    costSource: pick("costSource"),
    wholesaleSource: pick("wholesaleSource"),
  };
}

export function initialFrameValues(group: FrameTypeGroup | null | undefined): FrameTypeValues {
  if (group?.saved) return group.saved;
  return group?.products.length ? prevailingValues(group.products) : EMPTY_VALUES;
}

function categoryProducts(categoryId: string): FrameTypeProduct[] {
  const rows = getDb()
    .prepare("SELECT id, slug, title, price, in_stock, data FROM products WHERE category_id = ?")
    .all(categoryId) as Array<{
    id: string;
    slug: string;
    title: string;
    price: number;
    in_stock: number;
    data: string;
  }>;
  return rows.map((row) => {
    const data = JSON.parse(row.data) as Partial<Product>;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      sku: data.sku ?? "",
      price: row.price,
      costPrice: data.costPrice ?? null,
      wholesalePrice: data.wholesalePrice ?? null,
      stockQty: data.stockQty ?? null,
      inStock: row.in_stock === 1,
      priceSource: data.priceSource ?? null,
      costSource: data.costSource ?? null,
      wholesaleSource: data.wholesaleSource ?? null,
      storageCode: data.storageCode ?? "",
    };
  });
}

function typeRows(categoryId: string): TypeRow[] {
  return getDb()
    .prepare(`SELECT ${TYPE_COLUMNS} FROM frame_types WHERE category_id = ?`)
    .all(categoryId) as TypeRow[];
}

function typeRow(categoryId: string, type: string): TypeRow | undefined {
  return getDb()
    .prepare(`SELECT ${TYPE_COLUMNS} FROM frame_types WHERE category_id = ? AND type = ?`)
    .get(categoryId, type) as TypeRow | undefined;
}

export function listFrameTypes(categoryId: string): FrameTypeGroup[] {
  if (!isFrameCategory(categoryId)) return [];
  const saved = new Map(typeRows(categoryId).map((row) => [row.type, row]));
  const memberships = frameMembershipsIn(categoryId);

  const groups = new Map<string, FrameTypeProduct[]>();
  for (const type of saved.keys()) groups.set(type, []);
  for (const product of categoryProducts(categoryId)) {
    const type = memberships.get(product.id);
    if (!type) continue;
    const list = groups.get(type) ?? [];
    list.push(product);
    groups.set(type, list);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ru", { numeric: true }))
    .map(([type, products]) => {
      const row = saved.get(type);
      const first = products[0] ? productValues(products[0]) : null;
      return {
        type,
        name: row?.name ?? "",
        suffix: row?.suffix ?? commonValue(products, (product) => splitFrameSku(product.sku).suffix),
        storageCode: row?.storage_code ?? commonValue(products, (product) => product.storageCode),
        storageMixed: new Set(products.map((product) => product.storageCode)).size > 1,
        brief: row?.brief ?? "",
        specs: row ? parseSpecs(row.specs) : [],
        titleTemplate: row?.title_template || DEFAULT_TITLE_TEMPLATE,
        saved: row ? toValues(row) : null,
        products: products.sort((a, b) => a.title.localeCompare(b.title, "ru")),
        uniform: !first || products.every((product) => sameValues(productValues(product), first)),
        hasFrameImage: row?.has_frame_image === 1,
        composer: row?.composer ? parseComposerSettings(JSON.parse(row.composer)) : null,
      };
    });
}

export function getFrameType(categoryId: string, type: string): FrameTypeGroup | null {
  return listFrameTypes(categoryId).find((group) => group.type === type) ?? null;
}

export function frameTypeProductsOutside(
  categoryId: string,
  type: string,
): Array<{ id: string; title: string; sku: string; currentType: string }> {
  if (!isFrameCategory(categoryId)) return [];
  const memberships = frameMembershipsIn(categoryId);
  return categoryProducts(categoryId)
    .filter((product) => memberships.get(product.id) !== type)
    .map((product) => ({
      id: product.id,
      title: product.title,
      sku: product.sku,
      currentType: memberships.get(product.id) ?? "",
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "ru"));
}

export function validFrameTypeValues(input: unknown): FrameTypeValues | string {
  const value = (input ?? {}) as Record<string, unknown>;
  const money = (raw: unknown, name: string): number | null | string => {
    if (raw === null || raw === undefined || raw === "") return null;
    const number = Number(raw);
    return Number.isFinite(number) && number >= 0 ? number : `${name}: нужно число не меньше нуля`;
  };
  const costPrice = money(value.costPrice, "Себестоимость");
  const price = money(value.price, "Цена");
  const wholesalePrice = money(value.wholesalePrice, "Оптовая цена");
  const stockRaw = value.stockQty;
  const stockQty =
    stockRaw === null || stockRaw === undefined || stockRaw === ""
      ? null
      : Number.isInteger(Number(stockRaw)) && Number(stockRaw) >= 0
        ? Number(stockRaw)
        : "Остаток: нужно целое число не меньше нуля";
  for (const item of [costPrice, price, wholesalePrice, stockQty]) {
    if (typeof item === "string") return item;
  }
  const source = (raw: unknown): MoneySource | null | string => {
    if (raw === null || raw === undefined) return null;
    const parsed = moneySourceSchema.safeParse(raw);
    return parsed.success ? parsed.data : "Сумма в валюте указана неверно";
  };
  const priceSource = source(value.priceSource);
  const costSource = source(value.costSource);
  const wholesaleSource = source(value.wholesaleSource);
  for (const item of [priceSource, costSource, wholesaleSource]) {
    if (typeof item === "string") return item;
  }
  return {
    costPrice: costPrice as number | null,
    price: price as number | null,
    wholesalePrice: wholesalePrice as number | null,
    stockQty: stockQty as number | null,
    inStock: stockedByQty(stockQty as number | null),
    priceSource: priceSource as MoneySource | null,
    costSource: costSource as MoneySource | null,
    wholesaleSource: wholesaleSource as MoneySource | null,
  };
}

export function validFrameTypeInfo(input: unknown): FrameTypeInfo | string {
  const value = (input ?? {}) as Record<string, unknown>;
  const type = normalizeFrameType(String(value.type ?? ""));
  const suffix = normalizeFrameSuffix(String(value.suffix ?? ""));
  const name = String(value.name ?? "").trim().slice(0, 200);
  const storageCode = String(value.storageCode ?? "").trim().slice(0, 60);
  const brief = String(value.brief ?? "").trim().slice(0, 4000);
  const specs = Array.isArray(value.specs) ? cleanSpecs(value.specs) : [];
  const titleTemplate = String(value.titleTemplate ?? "").trim().slice(0, 200);
  if (!isFrameType(type)) {
    return "Номер рамки: начинается с цифры, дальше цифры и латинские буквы, до 10 знаков — например 110 или 110N";
  }
  if (!isFrameSuffix(suffix)) return "Дополнение: только буквы и цифры, части можно разделять дефисом";
  if (titleTemplate && !titleTemplate.includes("{")) {
    return "Шаблон названия: вставьте хотя бы одну подстановку, например {марка} {модель}";
  }
  return { type, suffix, name, storageCode, brief, specs, titleTemplate: titleTemplate || DEFAULT_TITLE_TEMPLATE };
}

function writeValues(product: Product, values: FrameTypeValues): Product {
  const next: Product = {
    ...product,
    price: values.price ?? 0,
    inStock: stockedByQty(values.stockQty),
  };
  for (const key of ["priceSource", "costSource", "wholesaleSource"] as const) {
    const source = values[key];
    if (source) next[key] = source;
    else delete next[key];
  }
  if (values.costPrice === null) delete next.costPrice;
  else next.costPrice = values.costPrice;
  if (values.wholesalePrice === null) delete next.wholesalePrice;
  else next.wholesalePrice = values.wholesalePrice;
  if (values.stockQty === null) delete next.stockQty;
  else next.stockQty = values.stockQty;
  return next;
}

export function applyToProduct(productId: string, values: FrameTypeValues): void {
  const db = getDb();
  const row = db.prepare("SELECT data FROM products WHERE id = ?").get(productId) as
    | { data: string }
    | undefined;
  if (!row) return;
  const next = writeValues(JSON.parse(row.data) as Product, values);
  db.prepare(
    "UPDATE products SET price = ?, in_stock = ?, data = ?, updated_at = ? WHERE id = ?",
  ).run(next.price, next.inStock ? 1 : 0, JSON.stringify(next), Date.now(), productId);
}

function upsertValues(categoryId: string, type: string, values: FrameTypeValues): void {
  getDb()
    .prepare(
      `INSERT INTO frame_types
         (category_id, type, cost_price, price, wholesale_price, stock_qty, in_stock,
          price_source, cost_source, wholesale_source, updated_at)
       VALUES (@categoryId, @type, @costPrice, @price, @wholesalePrice, @stockQty, @inStock,
          @priceSource, @costSource, @wholesaleSource, @now)
       ON CONFLICT(category_id, type) DO UPDATE SET
         cost_price = excluded.cost_price, price = excluded.price,
         wholesale_price = excluded.wholesale_price, stock_qty = excluded.stock_qty,
         in_stock = excluded.in_stock, price_source = excluded.price_source,
         cost_source = excluded.cost_source, wholesale_source = excluded.wholesale_source,
         updated_at = excluded.updated_at`,
    )
    .run({
      categoryId,
      type,
      ...values,
      inStock: values.inStock ? 1 : 0,
      priceSource: values.priceSource ? JSON.stringify(values.priceSource) : null,
      costSource: values.costSource ? JSON.stringify(values.costSource) : null,
      wholesaleSource: values.wholesaleSource ? JSON.stringify(values.wholesaleSource) : null,
      now: Date.now(),
    });
}

function ensureTypeRow(categoryId: string, type: string): boolean {
  if (typeRow(categoryId, type)) return false;
  const group = getFrameType(categoryId, type);
  upsertValues(categoryId, type, initialFrameValues(group));
  getDb()
    .prepare("UPDATE frame_types SET suffix = ? WHERE category_id = ? AND type = ?")
    .run(group?.suffix ?? "", categoryId, type);
  return true;
}

export function applyFrameType(
  categoryId: string,
  type: string,
  values: FrameTypeValues,
): number {
  const db = getDb();
  const products = getFrameType(categoryId, type)?.products ?? [];

  db.transaction(() => {
    ensureTypeRow(categoryId, type);
    upsertValues(categoryId, type, values);
    for (const product of products) applyToProduct(product.id, values);
  })();

  bumpCatalogVersion();
  return products.length;
}

function takenSkus(exceptIds: Set<string>): Set<string> {
  const rows = getDb()
    .prepare("SELECT id, json_extract(data, '$.sku') AS sku FROM products")
    .all() as Array<{ id: string; sku: string | null }>;
  return new Set(
    rows.filter((row) => row.sku && !exceptIds.has(row.id)).map((row) => row.sku as string),
  );
}

function freshNumber(taken: Set<string>): string {
  let candidate = nextSku();
  while (taken.has(candidate)) candidate = nextSku();
  return candidate;
}

export function newFrameSku(suffix: string, type: string): string {
  const taken = takenSkus(new Set());
  let sku = buildFrameSku({ number: freshNumber(taken), suffix, type });
  while (taken.has(sku)) sku = buildFrameSku({ number: freshNumber(taken), suffix, type });
  return sku;
}

function ownNumber(sku: string, taken: Set<string>): string {
  const { number } = splitFrameSku(sku);
  return /^[0-9A-ZА-ЯЁ]+$/.test(number) ? number : freshNumber(taken);
}

function rememberVdfArticle(productId: string, sku: string): void {
  if (!sku.trim()) return;
  getDb()
    .prepare("INSERT OR IGNORE INTO vdf_articles (product_id, article) VALUES (?, ?)")
    .run(productId, sku.trim());
}

function writeIdentity(productId: string, sku: string, storageCode?: string): void {
  const db = getDb();
  const row = db.prepare("SELECT data FROM products WHERE id = ?").get(productId) as
    | { data: string }
    | undefined;
  if (!row) return;
  const product = JSON.parse(row.data) as Product;
  const codeChanges = storageCode !== undefined && (product.storageCode ?? "") !== storageCode;
  if (product.sku === sku && !codeChanges) return;
  if (product.sku !== sku) rememberVdfArticle(productId, product.sku ?? "");
  product.sku = sku;
  if (storageCode === "") delete product.storageCode;
  else if (storageCode !== undefined) product.storageCode = storageCode;
  db.prepare("UPDATE products SET data = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(product),
    Date.now(),
    productId,
  );
}

function plannedSkus(
  products: Array<{ id: string; sku: string }>,
  suffix: string,
  type: string,
): Map<string, string> {
  const ids = new Set(products.map((product) => product.id));
  const taken = takenSkus(ids);
  const planned = new Map<string, string>();
  const used = new Set<string>();
  for (const product of products) {
    let sku = buildFrameSku({ number: ownNumber(product.sku, taken), suffix, type });
    while (taken.has(sku) || used.has(sku)) {
      sku = buildFrameSku({ number: freshNumber(taken), suffix, type });
    }
    used.add(sku);
    planned.set(product.id, sku);
  }
  return planned;
}

export function saveFrameTypeInfo(
  categoryId: string,
  previousType: string | null,
  info: FrameTypeInfo,
): FrameTypeResult {
  if (!isFrameCategory(categoryId)) return { ok: false, problems: ["Раздел рамок не найден"] };
  const db = getDb();
  const current = previousType ? getFrameType(categoryId, previousType) : null;
  if (previousType && !current) return { ok: false, problems: [`Типа ${previousType} нет`] };
  if (info.type !== previousType && getFrameType(categoryId, info.type)) {
    return { ok: false, problems: [`Тип ${info.type} уже есть — выберите другой номер`] };
  }

  const products = current?.products ?? [];
  const planned = plannedSkus(products, info.suffix, info.type);
  const keepMixedCodes = info.storageCode === "" && Boolean(current?.storageMixed);
  const storageCode = keepMixedCodes ? undefined : info.storageCode;

  db.transaction(() => {
    if (previousType) ensureTypeRow(categoryId, previousType);
    else upsertValues(categoryId, info.type, EMPTY_VALUES);
    db.prepare(
      `UPDATE frame_types SET type = ?, suffix = ?, name = ?, storage_code = ?, brief = ?, specs = ?,
              title_template = ?, updated_at = ?
        WHERE category_id = ? AND type = ?`,
    ).run(
      info.type,
      info.suffix,
      info.name,
      storageCode ?? null,
      info.brief,
      JSON.stringify(info.specs),
      info.titleTemplate === DEFAULT_TITLE_TEMPLATE ? "" : info.titleTemplate,
      Date.now(),
      categoryId,
      previousType ?? info.type,
    );
    if (previousType && previousType !== info.type) renameFrameMembers(categoryId, previousType, info.type);
    for (const [productId, sku] of planned) writeIdentity(productId, sku, storageCode);
  })();

  bumpCatalogVersion();
  return { ok: true, productIds: [...planned.keys()] };
}

export function deleteFrameType(categoryId: string, type: string): FrameTypeResult {
  const group = getFrameType(categoryId, type);
  if (!group) return { ok: false, problems: [`Типа ${type} нет`] };
  if (group.products.length) {
    return { ok: false, problems: ["Сначала уберите из типа все товары"] };
  }
  getDb().prepare("DELETE FROM frame_types WHERE category_id = ? AND type = ?").run(categoryId, type);
  return { ok: true, productIds: [] };
}

function productInCategory(categoryId: string, productId: string): { sku: string } | null {
  const row = getDb()
    .prepare("SELECT json_extract(data, '$.sku') AS sku FROM products WHERE id = ? AND category_id = ?")
    .get(productId, categoryId) as { sku: string | null } | undefined;
  return row ? { sku: row.sku ?? "" } : null;
}

export function addToFrameType(categoryId: string, type: string, productId: string): FrameTypeResult {
  const group = getFrameType(categoryId, type);
  if (!group) return { ok: false, problems: [`Типа ${type} нет`] };
  const product = productInCategory(categoryId, productId);
  if (!product) return { ok: false, problems: ["Товар не найден в разделе рамок"] };

  const planned = plannedSkus([{ id: productId, sku: product.sku }], group.suffix, type);

  const db = getDb();
  db.transaction(() => {
    ensureTypeRow(categoryId, type);
    setFrameMembership(productId, { categoryId, type });
    writeIdentity(productId, planned.get(productId) ?? "", group.storageCode || undefined);
    const row = typeRow(categoryId, type);
    if (row) applyToProduct(productId, toValues(row));
  })();

  bumpCatalogVersion();
  return { ok: true, productIds: [productId] };
}

export function removeFromFrameType(categoryId: string, productId: string): FrameTypeResult {
  const product = productInCategory(categoryId, productId);
  if (!product) return { ok: false, problems: ["Товар не найден в разделе рамок"] };
  const type = frameMembershipsIn(categoryId).get(productId);
  if (!type) return { ok: true, productIds: [] };

  const taken = takenSkus(new Set([productId]));
  const sku = ownNumber(product.sku, taken);

  const db = getDb();
  db.transaction(() => {
    ensureTypeRow(categoryId, type);
    setFrameMembership(productId, null);
    writeIdentity(productId, sku);
  })();

  bumpCatalogVersion();
  return { ok: true, productIds: [productId] };
}

export function setFrameTypeStock(
  categoryId: string,
  type: string,
  stockQty: number | null,
): FrameTypeResult {
  if (!getFrameType(categoryId, type)) return { ok: false, problems: [`Типа ${type} нет`] };
  ensureTypeRow(categoryId, type);
  const productIds = setGroupStock({ categoryId, type, stockQty }, stockQty);
  bumpCatalogVersion();
  return { ok: true, productIds };
}

export function readFrameImage(categoryId: string, type: string): Buffer | null {
  const row = getDb()
    .prepare("SELECT frame_image AS image FROM frame_types WHERE category_id = ? AND type = ?")
    .get(categoryId, type) as { image: Buffer | null } | undefined;
  return row?.image ?? null;
}

export function saveFrameComposer(
  categoryId: string,
  type: string,
  image: Buffer,
  settings: ComposerSettings,
): void {
  ensureTypeRow(categoryId, type);
  getDb()
    .prepare(
      `UPDATE frame_types SET frame_image = ?, composer = ?, updated_at = ?
        WHERE category_id = ? AND type = ?`,
    )
    .run(image, JSON.stringify(settings), Date.now(), categoryId, type);
}

export function frameComposerSettings(categoryId: string, type: string): ComposerSettings | null {
  const raw = typeRow(categoryId, type)?.composer;
  return raw ? parseComposerSettings(JSON.parse(raw)) : null;
}

export function defaultFrameCategory(categories: FrameCategory[]): string {
  return categories[0]?.id ?? "";
}
