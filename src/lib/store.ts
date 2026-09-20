import crypto from "node:crypto";

import { bumpCatalogVersion, getDb } from "./db";
import { pluralize } from "./format";
import { forgetRedirectsTo, rememberRedirect } from "./redirects";
import { deepTrim } from "./text";
import {
  categorySchema,
  parseOrThrow,
  productSchema,
  siteSchema,
  type Category,
  type Product,
  type Site,
} from "./schema";

/**
 * Запись каталога. Всё, что меняет товары, категории и настройки, проходит
 * через этот модуль — и, значит, через одни и те же проверки.
 *
 * Схемы из schema.ts здесь работают вторым рубежом: формы админки и так
 * собирают правильные объекты, но Server Actions — публичные точки входа,
 * до них можно достучаться POST-запросом мимо интерфейса. Поэтому доверия
 * входным данным нет и тут.
 *
 * Каждая функция возвращает список проблем вместо исключения: админке нужно
 * показать их рядом с полями, а не белый экран с ошибкой.
 */

export type SaveResult =
  | { ok: true }
  | { ok: false; problems: string[] };

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
  const product = parsed.data;
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

  db.prepare(
    "UPDATE products SET price = ?, data = ?, updated_at = ? WHERE id = ?",
  ).run(price, JSON.stringify(product), Date.now(), id);

  bumpCatalogVersion();
  return { ok: true };
}

/**
 * Складской остаток. Только в JSON: отдельной колонки под него нет и не
 * нужно — по остатку ничего не выбирается и не сортируется, а витрина о нём
 * вообще не знает. В списке админки он достаётся через json_extract.
 *
 * null — учёт не ведётся. Это не то же самое, что ноль: ноль означает «на
 * складе пусто», а null — «не считаем».
 */
export function setProductStockQty(id: string, qty: number | null): SaveResult {
  if (qty !== null && (!Number.isInteger(qty) || qty < 0)) {
    return { ok: false, problems: ["Количество — целое число не меньше нуля"] };
  }

  const db = getDb();
  const row = db.prepare("SELECT data FROM products WHERE id = ?").get(id) as
    | { data: string }
    | undefined;
  if (!row) return { ok: false, problems: ["Товар не найден"] };

  const product = JSON.parse(row.data) as Product;
  if (qty === null) delete product.stockQty;
  else product.stockQty = qty;

  db.prepare("UPDATE products SET data = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(product),
    Date.now(),
    id,
  );

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

/* ------------------------------------------------------------------ */
/* Категории                                                           */
/* ------------------------------------------------------------------ */

/**
 * Адрес страницы раздела по данным из базы.
 *
 * Дубль categoryUrl() из catalog.ts, и намеренный: тот считает по снимку
 * каталога, который на момент сохранения ещё не пересобран и показывает
 * состояние «до». Здесь же нужны оба состояния — и старое, и новое, — чтобы
 * понять, поменялся ли адрес.
 */
function categoryPath(slug: string, parentId: string | null): string {
  if (!parentId) return `/catalog/${slug}/`;
  const parent = getDb()
    .prepare("SELECT slug FROM categories WHERE id = ?")
    .get(parentId) as { slug: string } | undefined;
  return parent ? `/catalog/${parent.slug}/${slug}/` : `/catalog/${slug}/`;
}

/**
 * Правила дерева разделов. Проверяются при каждом сохранении.
 *
 * Их четыре, и все они про одно: дерево должно оставаться ровно
 * двухуровневым, а товары — лежать только в листьях.
 *
 * Почему товары не могут лежать в разделе с подразделами: страница такого
 * раздела показывает плитку подразделов, и товары рядом с ней оказались бы
 * ни в одном из них — попасть на них можно было бы только с этой страницы,
 * и ни в одну хлебную крошку они бы не легли.
 */
function checkParent(
  category: Category,
  previousId?: string,
  adoptProducts = false,
): string[] {
  const db = getDb();
  const problems: string[] = [];
  const id = previousId ?? category.id;

  if (category.parentId) {
    if (category.parentId === id) {
      problems.push("Раздел не может быть вложен сам в себя");
      return problems;
    }

    const parent = db
      .prepare("SELECT id, parent_id FROM categories WHERE id = ?")
      .get(category.parentId) as
      | { id: string; parent_id: string | null }
      | undefined;

    if (!parent) {
      problems.push(`Родительский раздел «${category.parentId}» не найден`);
      return problems;
    }
    if (parent.parent_id) {
      problems.push(
        "Подраздел нельзя вложить в другой подраздел — уровня всего два",
      );
    }

    const { n: inParent } = db
      .prepare("SELECT COUNT(*) AS n FROM products WHERE category_id = ?")
      .get(parent.id) as { n: number };
    if (inParent > 0 && !adoptProducts) {
      problems.push(
        `В разделе «${parent.id}» лежит ${pluralize(inParent, "товар", "товара", "товаров")}. ` +
          "Товары могут лежать только в разделах без подразделов — перенесите их в этот подраздел или в другой раздел.",
      );
    }

    const { n: children } = db
      .prepare("SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?")
      .get(id) as { n: number };
    if (children > 0) {
      problems.push(
        "У раздела есть свои подразделы — его нельзя сделать подразделом",
      );
    }
  }

  return problems;
}

/**
 * Сохранение раздела.
 *
 * `adoptProducts` — забрать товары родителя в этот подраздел. Без такой
 * возможности первый подраздел в непустом разделе создать невозможно:
 * товары нельзя оставить в родителе, но и перенести их некуда — подраздела
 * ещё нет. Замкнутый круг, в который упирается любой, кто решил разбить
 * разросшийся раздел на части.
 */
export function saveCategory(
  input: unknown,
  previousId?: string,
  adoptProducts = false,
): SaveResult {
  const parsed = categorySchema.safeParse(deepTrim(input));
  if (!parsed.success) {
    return { ok: false, problems: describe(parsed.error.issues) };
  }
  const category = parsed.data;
  const db = getDb();
  const problems: string[] = [];

  const idTaken = db
    .prepare("SELECT id FROM categories WHERE id = ? AND id IS NOT ?")
    .get(category.id, previousId ?? null);
  if (idTaken) problems.push(`Раздел с кодом «${category.id}» уже есть`);

  const slugTaken = db
    .prepare("SELECT id FROM categories WHERE slug = ? AND id IS NOT ?")
    .get(category.slug, previousId ?? null) as { id: string } | undefined;
  if (slugTaken) {
    problems.push(
      `Адрес «${category.slug}» уже занят разделом «${slugTaken.id}»`,
    );
  }

  problems.push(...checkParent(category, previousId, adoptProducts));

  if (problems.length) return { ok: false, problems };

  /*
   * Адреса до правки — сам раздел и все его подразделы.
   *
   * Подразделы здесь не для полноты: slug родителя входит в их адрес
   * (/catalog/aksessuary/maski/), и переименование родителя переносит
   * каждого из них. Без этих записей после переименования «Аксессуаров»
   * из поиска отвалились бы не только они сами, но и все вложенные разделы.
   */
  const previous = previousId
    ? (getDb()
        .prepare("SELECT slug, parent_id FROM categories WHERE id = ?")
        .get(previousId) as { slug: string; parent_id: string | null } | undefined)
    : undefined;

  const previousUrl = previous
    ? categoryPath(previous.slug, previous.parent_id)
    : "";
  const previousChildren = previous
    ? (getDb()
        .prepare("SELECT id, slug FROM categories WHERE parent_id = ?")
        .all(previousId) as Array<{ id: string; slug: string }>)
    : [];

  const adopted =
    adoptProducts && category.parentId
      ? (db
          .prepare("SELECT id, data FROM products WHERE category_id = ?")
          .all(category.parentId) as Array<{ id: string; data: string }>)
      : [];

  const save = db.prepare(
    `INSERT INTO categories (id, slug, name, parent_id, sort_order, data, updated_at)
     VALUES (@id, @slug, @name, @parentId, @order, @data, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       slug = @slug, name = @name, parent_id = @parentId, sort_order = @order,
       data = @data, updated_at = @updatedAt`,
  );

  const move = db.prepare(
    "UPDATE products SET category_id = ?, data = ?, updated_at = ? WHERE id = ?",
  );
  const now = Date.now();

  // Одной транзакцией: подраздел, забравший товары наполовину, оставил бы
  // родителя с подразделом и товарами разом — то есть в состоянии, которого
  // все эти проверки и не допускают.
  db.transaction(() => {
    save.run({
      id: category.id,
      slug: category.slug,
      name: category.name,
      parentId: category.parentId ?? null,
      order: category.order ?? 999,
      data: JSON.stringify(category),
      updatedAt: now,
    });

    for (const row of adopted) {
      const product = JSON.parse(row.data) as Product;
      product.categoryId = category.id;
      move.run(category.id, JSON.stringify(product), now, row.id);
    }
  })();

  if (previous) {
    const url = categoryPath(category.slug, category.parentId ?? null);
    rememberRedirect(previousUrl, url);
    for (const child of previousChildren) {
      rememberRedirect(
        `/catalog/${previous.slug}/${child.slug}/`,
        categoryPath(child.slug, category.id),
      );
    }
  }

  bumpCatalogVersion();
  return { ok: true };
}

/**
 * Удаление раздела. Если в нём есть товары — отказ: молча утащить за собой
 * полсотни позиций страшнее, чем заставить сначала их перенести.
 */
/**
 * Удаление раздела.
 *
 * `moveTo` — раздел, в который уедут товары. Без него раздел с товарами не
 * удаляется: товар без существующего раздела пропадает из меню и с витрины,
 * но остаётся в базе — искать его потом негде.
 *
 * Подразделы удаляемого раздела поднимаются на верхний уровень. Их адреса
 * при этом укорачиваются, о чём админка предупреждает до удаления.
 *
 * Перенос и удаление идут одной транзакцией: если раздел исчезнет, а товары
 * переехать не успеют, они как раз и окажутся в этом подвешенном состоянии.
 */
export function deleteCategory(id: string, moveTo?: string): SaveResult {
  const db = getDb();
  const { n } = db
    .prepare("SELECT COUNT(*) AS n FROM products WHERE category_id = ?")
    .get(id) as { n: number };

  if (n > 0) {
    if (!moveTo) {
      return {
        ok: false,
        problems: [
          `В разделе ещё ${pluralize(n, "товар", "товара", "товаров")}. Укажите, в какой раздел их перенести.`,
        ],
      };
    }
    if (moveTo === id) {
      return { ok: false, problems: ["Перенести товары можно только в другой раздел"] };
    }
    const target = db
      .prepare("SELECT id FROM categories WHERE id = ?")
      .get(moveTo) as { id: string } | undefined;
    if (!target) {
      return { ok: false, problems: ["Раздел, в который переносим товары, не найден"] };
    }
    const { n: targetChildren } = db
      .prepare("SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?")
      .get(moveTo) as { n: number };
    if (targetChildren > 0) {
      return {
        ok: false,
        problems: [
          "У раздела, в который переносим, есть подразделы — выберите один из них",
        ],
      };
    }
  }

  const gone = db
    .prepare("SELECT slug, parent_id FROM categories WHERE id = ?")
    .get(id) as { slug: string; parent_id: string | null } | undefined;

  const products = db
    .prepare("SELECT id, data FROM products WHERE category_id = ?")
    .all(id) as Array<{ id: string; data: string }>;

  // Подразделы удаляемого раздела поднимаются на верхний уровень вместе со
  // своими товарами. Других вариантов у них нет: вложить их в чужой раздел
  // — решение за админа, а удалить вместе с родителем значило бы потерять
  // товары, о которых никто не спрашивал.
  const children = db
    .prepare("SELECT id, data FROM categories WHERE parent_id = ?")
    .all(id) as Array<{ id: string; data: string }>;

  // Правим и колонку, и JSON: по колонке идут выборки, а JSON — источник
  // правды, из которого страница собирает товар.
  const move = db.prepare(
    "UPDATE products SET category_id = ?, data = ?, updated_at = ? WHERE id = ?",
  );
  const now = Date.now();

  const promote = db.prepare(
    "UPDATE categories SET parent_id = NULL, data = ?, updated_at = ? WHERE id = ?",
  );

  db.transaction(() => {
    for (const row of products) {
      const product = JSON.parse(row.data) as Product;
      product.categoryId = moveTo!;
      move.run(moveTo, JSON.stringify(product), now, row.id);
    }
    for (const row of children) {
      const child = JSON.parse(row.data) as Category;
      delete child.parentId;
      promote.run(JSON.stringify(child), now, row.id);
    }
    db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  })();

  if (gone) {
    // Раздела больше нет — вести на него со старых адресов некуда.
    forgetRedirectsTo(categoryPath(gone.slug, gone.parent_id));
    // А вот его подразделы никуда не делись, только адрес у них укоротился:
    // /catalog/aksessuary/maski/ → /catalog/maski/. Об этом и предупреждает
    // админка перед удалением — здесь мы делаем предупреждение безобидным.
    for (const row of children) {
      const child = JSON.parse(row.data) as Category;
      rememberRedirect(
        `/catalog/${gone.slug}/${child.slug}/`,
        `/catalog/${child.slug}/`,
      );
    }
  }

  bumpCatalogVersion();
  return { ok: true };
}

export function reorderCategories(ids: string[]): void {
  const db = getDb();
  const update = db.prepare(
    "UPDATE categories SET sort_order = ? WHERE id = ?",
  );
  db.transaction(() => {
    ids.forEach((id, index) => update.run((index + 1) * 10, id));
  })();
  bumpCatalogVersion();
}

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

/* ------------------------------------------------------------------ */
/* Служебное                                                           */
/* ------------------------------------------------------------------ */

/** Ошибки zod в вид, понятный человеку у формы. */
function describe(issues: Array<{ path: PropertyKey[]; message: string }>): string[] {
  return issues.map((issue) => {
    const where = issue.path.length ? issue.path.join(" → ") : "форма";
    return `${where}: ${issue.message}`;
  });
}

/** Списки для выпадающих меню админки — без разбора всего каталога схемой. */
export interface CategoryBrief {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  /** Товаров непосредственно в этом разделе, без подразделов. */
  count: number;
  children: number;
}

/**
 * Плоский список разделов для админки — уже в порядке дерева: родитель,
 * следом его подразделы. Собирать иерархию в каждом шаблоне не нужно,
 * достаточно посмотреть на parentId, чтобы решить, делать ли отступ.
 */
export function listCategoriesBrief(): CategoryBrief[] {
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.name, c.slug, c.parent_id AS parentId,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS count,
              (SELECT COUNT(*) FROM categories k WHERE k.parent_id = c.id) AS children
         FROM categories c
        ORDER BY c.sort_order, c.name`,
    )
    .all() as CategoryBrief[];

  const roots = rows.filter((row) => !row.parentId);
  return roots.flatMap((root) => [
    root,
    ...rows.filter((row) => row.parentId === root.id),
  ]);
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
  /** Складской остаток для внутреннего учёта. null — учёт не ведётся. */
  stockQty: number | null;
  /** Складской номер — где товар лежит. Пусто, если не заведён. */
  storageCode: string;
  updatedAt: number;
  image: string | null;
}

/**
 * Список товаров для таблицы в админке. Из JSON достаётся только первое фото
 * — разбирать все шестьсот товаров схемой ради списка не нужно.
 */
export function listProducts(filter: {
  categoryId?: string;
  query?: string;
  limit?: number;
  offset?: number;
}): { rows: ProductBrief[]; total: number } {
  const where: string[] = [];
  const params: Record<string, string | number> = {};

  if (filter.categoryId) {
    where.push("category_id = @categoryId");
    params.categoryId = filter.categoryId;
  }
  if (filter.query?.trim()) {
    where.push("(title LIKE @q OR brand LIKE @q OR id LIKE @q OR slug LIKE @q)");
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
              json_extract(data, '$.storageCode') AS storage_code
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
    storage_code: string | null;
  }>;

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
      storageCode: row.storage_code ?? "",
      updatedAt: row.updated_at,
      image: row.image,
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

export function getCategoryRaw(id: string): Category | null {
  const row = getDb()
    .prepare("SELECT data FROM categories WHERE id = ?")
    .get(id) as { data: string } | undefined;
  return row
    ? parseOrThrow(categorySchema, JSON.parse(row.data), `раздел ${id}`)
    : null;
}

export function getSiteRaw(): Site | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = 'site'")
    .get() as { value: string } | undefined;
  return row
    ? parseOrThrow(siteSchema, JSON.parse(row.value), "настройки сайта")
    : null;
}
