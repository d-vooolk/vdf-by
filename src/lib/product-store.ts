import crypto from "node:crypto";
import { bumpCatalogVersion, getDb } from "./db";
import { forgetRedirectsTo, rememberRedirect } from "./redirects";
import { deepTrim } from "./text";
import { parseOrThrow, productSchema, type Product } from "./schema";
import type { MoneySource } from "./currency";
import { setGroupStock, stockGroupOf } from "./shared-stock";
import { applyOptionStock, countedOptionGroupIndex, stockedByQty } from "./variant";
import { SaveResult, describe } from "./store";

/* ------------------------------------------------------------------ */
/* Товары                                                              */
/* ------------------------------------------------------------------ */

/**
 * Сохраняет товар. `previousId` пустой при создании; при правке он совпадает
 * с product.id — идентификатор менять нельзя, он входит в ключ корзины.
 */
export function saveProduct(input: unknown, previousId?: string): SaveResult {
  const parsed = productSchema.safeParse(deepTrim(input));
  if (!parsed.success) {
    return { ok: false, problems: describe(parsed.error.issues) };
  }
  const product = applyOptionStock({
    ...parsed.data,
    inStock: stockedByQty(parsed.data.stockQty),
  });
  const db = getDb();
  const problems: string[] = [];

  // Прежний адрес запоминаем до записи: если он поменялся, со старого
  // адреса нужна постоянная переадресация на новый.
  const before = previousId
    ? (db.prepare("SELECT slug FROM products WHERE id = ?").get(previousId) as
        | { slug: string }
        | undefined)
    : undefined;

  const category = db
    .prepare("SELECT id FROM categories WHERE id = ?")
    .get(product.categoryId);
  if (!category) {
    problems.push(`Раздел «${product.categoryId}» не найден`);
  } else {
    // Товары живут только в листьях дерева: у раздела с подразделами
    // страница занята плиткой подразделов, товару там не показаться.
    const { n } = db
      .prepare("SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?")
      .get(product.categoryId) as { n: number };
    if (n > 0) {
      problems.push(
        `У раздела «${product.categoryId}» есть подразделы — выберите один из них`,
      );
    }
  }

  const idTaken = db
    .prepare("SELECT id FROM products WHERE id = ? AND id IS NOT ?")
    .get(product.id, previousId ?? null);
  if (idTaken) {
    problems.push(`Товар с кодом «${product.id}» уже есть`);
  }

  const slugTaken = db
    .prepare("SELECT id FROM products WHERE slug = ? AND id IS NOT ?")
    .get(product.slug, previousId ?? null) as { id: string } | undefined;
  if (slugTaken) {
    problems.push(
      `Адрес «${product.slug}» уже занят товаром «${slugTaken.id}» — придумайте другой`,
    );
  }

  // Артикул уникален: по нему товар находят в админке и называют по телефону,
  // а два товара с одним артикулом превращают этот поиск в угадайку. Отдельной
  // колонки под него нет — он лежит в JSON, оттуда и сравниваем.
  if (product.sku) {
    const skuTaken = db
      .prepare(
        `SELECT id FROM products
           WHERE json_extract(data, '$.sku') = ? AND id IS NOT ?`,
      )
      .get(product.sku, previousId ?? null) as { id: string } | undefined;
    if (skuTaken) {
      problems.push(
        `Артикул «${product.sku}» уже стоит у товара «${skuTaken.id}» — перегенерируйте его`,
      );
    }
  }

  if (problems.length) return { ok: false, problems };

  const now = Date.now();
  db.prepare(
    `INSERT INTO products
       (id, slug, category_id, title, brand, price, in_stock, featured,
        sort_order, data, updated_at)
     VALUES
       (@id, @slug, @categoryId, @title, @brand, @price, @inStock, @featured,
        COALESCE((SELECT sort_order FROM products WHERE id = @id),
                 (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM products
                   WHERE category_id = @categoryId)),
        @data, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       slug = @slug, category_id = @categoryId, title = @title, brand = @brand,
       price = @price, in_stock = @inStock, featured = @featured,
       data = @data, updated_at = @updatedAt`,
  ).run({
    id: product.id,
    slug: product.slug,
    categoryId: product.categoryId,
    title: product.title,
    brand: product.brand ?? "",
    price: product.price,
    inStock: product.inStock ? 1 : 0,
    featured: product.featured ? 1 : 0,
    data: JSON.stringify(product),
    updatedAt: now,
  });

  if (before && before.slug !== product.slug) {
    rememberRedirect(`/product/${before.slug}/`, `/product/${product.slug}/`);
  }

  bumpCatalogVersion();
  return { ok: true };
}

export function deleteProduct(id: string): void {
  const db = getDb();
  const row = db.prepare("SELECT slug FROM products WHERE id = ?").get(id) as
    | { slug: string }
    | undefined;

  db.prepare("DELETE FROM products WHERE id = ?").run(id);
  if (row) forgetRedirectsTo(`/product/${row.slug}/`);

  bumpCatalogVersion();
}

/**
 * Удаление пачкой — из списка товаров с галочками.
 *
 * Одной транзакцией и одним подъёмом версии каталога: удалять полсотни
 * позиций по одной значило бы полсотни раз пересобрать снимок каталога,
 * причём каждый раз — из недоудалённого состояния.
 */
export function deleteProducts(ids: string[]): number {
  if (!ids.length) return 0;

  const db = getDb();
  const slugs = db
    .prepare(
      `SELECT slug FROM products WHERE id IN (${ids.map(() => "?").join(",")})`,
    )
    .all(...ids) as Array<{ slug: string }>;

  const remove = db.prepare("DELETE FROM products WHERE id = ?");
  const removed = db.transaction((list: string[]) => {
    let count = 0;
    for (const id of list) count += remove.run(id).changes;
    return count;
  })(ids);

  for (const row of slugs) forgetRedirectsTo(`/product/${row.slug}/`);

  bumpCatalogVersion();
  return removed;
}

/**
 * Цена прямо из списка товаров.
 *
 * Правится и колонка, и JSON: по колонке идут выборки и сортировки, а JSON
 * остаётся источником правды, из которого страница собирает товар.
 *
 * Важно: цену значения опции это не трогает. У товара с опциями своими
 * ценами эта цена — запасная, и в списке она показана именно как таковая.
 */
export function setProductPrice(id: string, price: number): SaveResult {
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, problems: ["Цена должна быть числом не меньше нуля"] };
  }

  const db = getDb();
  const row = db.prepare("SELECT data FROM products WHERE id = ?").get(id) as
    | { data: string }
    | undefined;
  if (!row) return { ok: false, problems: ["Товар не найден"] };

  const product = JSON.parse(row.data) as Product;
  product.price = price;
  delete product.priceSource;

  db.prepare(
    "UPDATE products SET price = ?, data = ?, updated_at = ? WHERE id = ?",
  ).run(price, JSON.stringify(product), Date.now(), id);

  bumpCatalogVersion();
  return { ok: true };
}

export function setProductFaq(id: string, faq: Array<{ q: string; a: string }>): SaveResult {
  const db = getDb();
  const row = db.prepare("SELECT data FROM products WHERE id = ?").get(id) as
    | { data: string }
    | undefined;
  if (!row) return { ok: false, problems: ["Товар не найден"] };

  const product = JSON.parse(row.data) as Product;
  product.faq = faq;

  db.prepare("UPDATE products SET data = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(product),
    Date.now(),
    id,
  );

  bumpCatalogVersion();
  return { ok: true };
}

export function setProductDescription(id: string, description: string): SaveResult {
  const db = getDb();
  const row = db.prepare("SELECT data FROM products WHERE id = ?").get(id) as
    | { data: string }
    | undefined;
  if (!row) return { ok: false, problems: ["Товар не найден"] };

  const product = JSON.parse(row.data) as Product;
  product.description = description;

  db.prepare("UPDATE products SET data = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(product),
    Date.now(),
    id,
  );

  bumpCatalogVersion();
  return { ok: true };
}

export function setProductStockQty(id: string, qty: number | null): SaveResult {
  if (qty !== null && (!Number.isInteger(qty) || qty < 0)) {
    return { ok: false, problems: ["Количество — целое число не меньше нуля"] };
  }

  const db = getDb();
  const row = db.prepare("SELECT data FROM products WHERE id = ?").get(id) as
    | { data: string }
    | undefined;
  if (!row) return { ok: false, problems: ["Товар не найден"] };

  const group = stockGroupOf(id);
  if (group) {
    setGroupStock(group, qty);
    bumpCatalogVersion();
    return { ok: true };
  }

  const product = JSON.parse(row.data) as Product;
  if (countedOptionGroupIndex({ optionGroups: product.optionGroups ?? [] }) !== -1) {
    return {
      ok: false,
      problems: ["Количество считается по опциям — поправьте его в карточке товара"],
    };
  }
  if (qty === null) delete product.stockQty;
  else product.stockQty = qty;
  product.inStock = stockedByQty(qty);

  db.prepare(
    "UPDATE products SET in_stock = ?, data = ?, updated_at = ? WHERE id = ?",
  ).run(product.inStock ? 1 : 0, JSON.stringify(product), Date.now(), id);

  bumpCatalogVersion();
  return { ok: true };
}

/**
 * Свободный артикул: шесть цифр, каких нет ни у одного товара.
 *
 * Случайный, а не «последний плюс один»: подряд идущие номера у соседних
 * товаров читаются как один и тот же, и в заказе их легко перепутать.
 * Уникальность здесь только предварительная — окончательно её проверяет
 * saveProduct, потому что между генерацией и сохранением проходит время.
 */
export function nextSku(): string {
  const rows = getDb()
    .prepare("SELECT json_extract(data, '$.sku') AS sku FROM products")
    .all() as Array<{ sku: string | null }>;
  const used = new Set(
    rows.map((row) => row.sku).filter((sku): sku is string => Boolean(sku)),
  );

  // crypto, а не Math.random: номер не секрет, но предсказуемый счётчик
  // случайностей здесь и не нужен, а статические анализаторы справедливо
  // придираются к Math.random в генераторах идентификаторов.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const sku = String(crypto.randomInt(100000, 1000000));
    if (!used.has(sku)) return sku;
  }

  // Полсотни попыток подряд попали в занятые — значит, свободных номеров почти
  // не осталось, и перебрать диапазон по порядку уже дешевле, чем гадать.
  for (let code = 100000; code <= 999999; code += 1) {
    const sku = String(code);
    if (!used.has(sku)) return sku;
  }

  throw new Error("Свободных шестизначных артикулов не осталось");
}

/**
 * Бренды, которые уже встречались в товарах — для подсказки в форме.
 *
 * Читается из колонки brand, а не из снимка каталога: админке нужен список
 * сразу после сохранения, а снимок к этому моменту ещё прежний.
 */
export function listBrands(): string[] {
  const rows = getDb()
    .prepare("SELECT DISTINCT brand FROM products WHERE brand <> ''")
    .all() as Array<{ brand: string }>;
  return rows
    .map((row) => row.brand)
    .sort((a, b) => a.localeCompare(b, "ru"));
}

/** Порядок товаров внутри раздела: список id в нужной последовательности. */
export function reorderProducts(ids: string[]): void {
  const db = getDb();
  const update = db.prepare(
    "UPDATE products SET sort_order = ? WHERE id = ?",
  );
  db.transaction(() => {
    ids.forEach((id, index) => update.run((index + 1) * 10, id));
  })();
  bumpCatalogVersion();
}

export interface ProductBrief {
  id: string;
  slug: string;
  title: string;
  brand: string;
  price: number;
  categoryId: string;
  inStock: boolean;
  featured: boolean;
  stockQty: number | null;
  optionStock: boolean;
  priceSource: MoneySource | null;
  /** Складской номер — где товар лежит. Пусто, если не заведён. */
  storageCode: string;
  updatedAt: number;
  image: string | null;
  sku: string;
  costPrice: number | null;
  wholesalePrice: number | null;
  costSource: MoneySource | null;
  wholesaleSource: MoneySource | null;
}

/**
 * Список товаров для таблицы в админке. Из JSON достаётся только первое фото
 * — разбирать все шестьсот товаров схемой ради списка не нужно.
 */
export function listProducts(filter: {
  categoryId?: string;
  query?: string;
  outOfStock?: boolean;
  limit?: number;
  offset?: number;
}): { rows: ProductBrief[]; total: number } {
  const where: string[] = [];
  const params: Record<string, string | number> = {};

  if (filter.categoryId) {
    where.push("category_id IN (SELECT id FROM categories WHERE id = @categoryId OR parent_id = @categoryId)");
    params.categoryId = filter.categoryId;
  }
  if (filter.outOfStock) where.push("in_stock = 0");
  if (filter.query?.trim()) {
    where.push(
      "(title LIKE @q OR brand LIKE @q OR id LIKE @q OR slug LIKE @q OR json_extract(data, '$.sku') LIKE @q)",
    );
    params.q = `%${filter.query.trim()}%`;
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = (
    getDb()
      .prepare(`SELECT COUNT(*) AS n FROM products ${clause}`)
      .get(params) as { n: number }
  ).n;

  const rows = getDb()
    .prepare(
      `SELECT id, slug, title, brand, price, category_id, in_stock, featured,
              updated_at, json_extract(data, '$.images[0]') AS image,
              json_extract(data, '$.stockQty') AS stock_qty,
              json_extract(data, '$.priceSource') AS price_source,
              json_extract(data, '$.storageCode') AS storage_code,
              json_extract(data, '$.sku') AS sku,
              json_extract(data, '$.costPrice') AS cost_price,
              json_extract(data, '$.wholesalePrice') AS wholesale_price,
              json_extract(data, '$.costSource') AS cost_source,
              json_extract(data, '$.wholesaleSource') AS wholesale_source,
              EXISTS (
                SELECT 1 FROM json_each(data, '$.optionGroups') AS g,
                              json_each(g.value, '$.values') AS v
                 WHERE json_extract(v.value, '$.stockQty') IS NOT NULL
              ) AS option_stock
         FROM products ${clause}
        ORDER BY updated_at DESC
        LIMIT @limit OFFSET @offset`,
    )
    .all({
      ...params,
      limit: filter.limit ?? 50,
      offset: filter.offset ?? 0,
    }) as Array<{
    id: string;
    slug: string;
    title: string;
    brand: string;
    price: number;
    category_id: string;
    in_stock: number;
    featured: number;
    updated_at: number;
    image: string | null;
    stock_qty: number | null;
    price_source: string | null;
    storage_code: string | null;
    sku: string | null;
    cost_price: number | null;
    wholesale_price: number | null;
    cost_source: string | null;
    wholesale_source: string | null;
    option_stock: number;
  }>;

  const source = (raw: string | null) => (raw ? (JSON.parse(raw) as MoneySource) : null);

  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      brand: row.brand,
      price: row.price,
      categoryId: row.category_id,
      inStock: row.in_stock === 1,
      featured: row.featured === 1,
      stockQty: row.stock_qty ?? null,
      optionStock: row.option_stock === 1,
      priceSource: source(row.price_source),
      storageCode: row.storage_code ?? "",
      updatedAt: row.updated_at,
      image: row.image,
      sku: row.sku ?? "",
      costPrice: row.cost_price ?? null,
      wholesalePrice: row.wholesale_price ?? null,
      costSource: source(row.cost_source),
      wholesaleSource: source(row.wholesale_source),
    })),
  };
}

/** Сколько товаров выключено из продажи — для предупреждения в сводке. */
export function countOutOfStock(): number {
  return (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM products WHERE in_stock = 0")
      .get() as { n: number }
  ).n;
}

/**
 * Один товар для формы правки — сырой объект, каким его отдаст страница.
 *
 * Через схему, а не голым JSON.parse с приведением типа: в схеме у полей
 * вроде optionGroups и specs стоит .default([]), и тип Product обещает, что
 * массивы на месте. В базе же лежит ровно то, что записали, — у товара без
 * опций ключа optionGroups просто нет. Приведение это скрывало, а первый же
 * обход массива падал с «undefined is not iterable», и форма отдавала 500.
 */
export function getProductRaw(id: string): Product | null {
  const row = getDb()
    .prepare("SELECT data FROM products WHERE id = ?")
    .get(id) as { data: string } | undefined;
  return row
    ? parseOrThrow(productSchema, JSON.parse(row.data), `товар ${id}`)
    : null;
}
