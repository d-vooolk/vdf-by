import { catalogVersion, getDb } from "./db";
import {
  parseOrThrow,
  productSchema,
  categorySchema,
  siteSchema,
  type Category,
  type Product,
  type Site,
} from "./schema";
import { hasAnyInStock } from "./variant";

/**
 * Чтение каталога из базы.
 *
 * Раньше здесь читались файлы ./data/*.json. Формат данных при переезде не
 * изменился: в колонке `data` лежит ровно тот же объект товара, что лежал в
 * JSON, и проверяется он той же схемой из schema.ts. Поэтому админка и файлы
 * описывают одно и то же, а `scripts/import-data.mjs` умеет переливать одно
 * в другое.
 *
 * Функции остались синхронными — драйвер SQLite синхронный. Благодаря этому
 * все страницы и компоненты, написанные под чтение с диска, работают без
 * единой правки.
 */

interface Catalog {
  site: Site;
  categories: Category[];
  products: Product[];
  /** Значение счётчика правок, при котором собран этот снимок. */
  version: number;
}

let cache: Catalog | null = null;

interface ProductRow {
  data: string;
}

interface CategoryRow {
  data: string;
}

/**
 * Снимок каталога целиком. Собирается заново только если после прошлого раза
 * что-то сохранили в админке: catalogVersion() — это один короткий запрос,
 * а разбор шести сотен товаров схемой — уже заметная работа.
 */
function load(): Catalog {
  const version = catalogVersion();
  if (cache && cache.version === version) return cache;

  const db = getDb();

  const siteRow = db
    .prepare("SELECT value FROM settings WHERE key = 'site'")
    .get() as { value: string } | undefined;

  if (!siteRow) {
    throw new Error(
      "\n\nВ базе нет настроек сайта — похоже, она ещё пустая.\n" +
        "Залейте начальные данные: npm run import\n",
    );
  }

  const site = parseOrThrow(
    siteSchema,
    JSON.parse(siteRow.value),
    "настройки сайта (таблица settings)",
  );

  const categoryRows = db
    .prepare("SELECT data FROM categories ORDER BY sort_order, name")
    .all() as CategoryRow[];

  const categories = categoryRows.map((row, index) =>
    parseOrThrow(
      categorySchema,
      JSON.parse(row.data),
      `категория №${index + 1} (таблица categories)`,
    ),
  );

  const productRows = db
    .prepare(
      `SELECT p.data FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY c.sort_order, p.sort_order, p.title`,
    )
    .all() as ProductRow[];

  const products = productRows.map((row, index) => {
    const product = parseOrThrow(
      productSchema,
      JSON.parse(row.data),
      `товар №${index + 1} (таблица products)`,
    );
    delete product.costPrice;
    delete product.wholesalePrice;
    delete product.costSource;
    delete product.wholesaleSource;
    delete product.storageCode;
    return product;
  });

  const available = products.filter(hasAnyInStock);
  const unavailable = products.filter((product) => !hasAnyInStock(product));

  cache = { site, categories, products: [...available, ...unavailable], version };
  return cache;
}

/**
 * Сбросить снимок принудительно. Нужен импортёру и тестам, которые правят
 * базу в обход админки и потому не двигают счётчик версий.
 */
export function invalidateCatalog(): void {
  cache = null;
}

export function getSite(): Site {
  return load().site;
}

export function getCategories(): Category[] {
  return load().categories;
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return load().categories.find((c) => c.slug === slug);
}

export function getCategoryById(id: string): Category | undefined {
  return load().categories.find((c) => c.id === id);
}

/* ------------------------------------------------------------------ */
/* Дерево разделов                                                     */
/* ------------------------------------------------------------------ */

/**
 * Разделы верхнего уровня — то, что попадает в меню и на плитку каталога.
 * Подразделы висят внутри своих родителей и отдельно в этом списке не нужны.
 */
export function getRootCategories(): Category[] {
  return load().categories.filter((c) => !c.parentId);
}

/** Подразделы одного раздела, в том же порядке, что и весь список. */
export function getChildCategories(parentId: string): Category[] {
  return load().categories.filter((c) => c.parentId === parentId);
}

/** Есть ли у раздела подразделы. Если да — своих товаров у него нет. */
export function hasChildren(categoryId: string): boolean {
  return load().categories.some((c) => c.parentId === categoryId);
}

/**
 * Адрес страницы раздела.
 *
 * У подраздела он вложенный: /catalog/aksessuary/maski/. Единственное место,
 * где адрес раздела собирается из частей, — чтобы вложенность не пришлось
 * помнить в каждом шаблоне, sitemap и сбросе кеша по отдельности.
 */
export function categoryUrl(category: Category): string {
  if (!category.parentId) return `/catalog/${category.slug}/`;
  const parent = getCategoryById(category.parentId);
  // Родителя нет — данные разъехались; отдаём плоский адрес, он хотя бы
  // ведёт на страницу, а не в никуда.
  return parent
    ? `/catalog/${parent.slug}/${category.slug}/`
    : `/catalog/${category.slug}/`;
}

/**
 * Страницы, на которых виден товар этого раздела: сам раздел и, если он
 * вложенный, родитель — там стоит счётчик и плитка подразделов.
 */
export function categoryPaths(categoryId: string | undefined): string[] {
  const category = categoryId ? getCategoryById(categoryId) : undefined;
  return category ? categoryTrail(category).map(categoryUrl) : [];
}

/**
 * Страницы, которые надо пересобрать при правке самого раздела.
 *
 * Кроме него и родителя — ещё и подразделы: их адрес начинается со slug'а
 * родителя, и переименование родителя меняет адрес каждого из них.
 */
export function categorySubtreePaths(categoryId: string): string[] {
  return [
    ...categoryPaths(categoryId),
    ...getChildCategories(categoryId).map(categoryUrl),
  ];
}

/** Цепочка от верхнего уровня до раздела — для хлебных крошек. */
export function categoryTrail(category: Category): Category[] {
  const parent = category.parentId
    ? getCategoryById(category.parentId)
    : undefined;
  return parent ? [parent, category] : [category];
}

export function getProducts(): Product[] {
  return load().products;
}

export function getProductBySlug(slug: string): Product | undefined {
  return load().products.find((p) => p.slug === slug);
}

export function getProductById(id: string): Product | undefined {
  return load().products.find((p) => p.id === id);
}

/** Товары, лежащие непосредственно в этом разделе. */
export function getProductsByCategory(categoryId: string): Product[] {
  return load().products.filter((p) => p.categoryId === categoryId);
}

/**
 * Товары раздела вместе с товарами его подразделов.
 *
 * Именно это нужно странице раздела, фильтру брендов и разметке ItemList: у
 * родителя своих товаров нет, и без подразделов страница «Аксессуаров» была
 * бы пустой.
 */
export function getProductsInCategory(categoryId: string): Product[] {
  const ids = new Set([
    categoryId,
    ...getChildCategories(categoryId).map((c) => c.id),
  ]);
  return load().products.filter((p) => ids.has(p.categoryId));
}

export function getFeaturedProducts(limit = 8): Product[] {
  const products = load().products;
  const featured = products.filter((p) => p.featured);
  // Если хитов не отмечено — не показываем пустой блок, берём начало каталога.
  return (featured.length ? featured : products).slice(0, limit);
}

/** Товары той же категории, кроме текущего. Для блока «Похожие товары». */
export function getRelatedProducts(product: Product, limit = 4): Product[] {
  return load()
    .products.filter(
      (p) => p.categoryId === product.categoryId && p.id !== product.id,
    )
    .slice(0, limit);
}

/**
 * Сколько товаров в категории — для счётчиков в меню и на главной.
 *
 * Родителю считаются товары его подразделов: своих у него нет (товары лежат
 * только в листьях), а «Аксессуары 0» рядом с двумя непустыми подразделами
 * читались бы как пустой раздел.
 */
export function getCategoryCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  const { categories, products } = load();

  for (const product of products) {
    counts[product.categoryId] = (counts[product.categoryId] ?? 0) + 1;
  }
  for (const category of categories) {
    if (!category.parentId) continue;
    counts[category.parentId] =
      (counts[category.parentId] ?? 0) + (counts[category.id] ?? 0);
  }

  return counts;
}

/** Уникальные бренды произвольной выборки — для фильтра над ней. */
export function brandsOf(products: Product[]): string[] {
  const brands = new Set<string>();
  for (const product of products) {
    if (product.brand) brands.add(product.brand);
  }
  return [...brands].sort((a, b) => a.localeCompare(b, "ru"));
}

/** Уникальные бренды категории — для фильтра. */
export function getBrands(categoryId?: string): string[] {
  return brandsOf(
    categoryId ? getProductsInCategory(categoryId) : getProducts(),
  );
}

/**
 * Когда каталог правили последний раз — для lastModified в sitemap.xml.
 * Раньше эту дату брали из времени изменения JSON-файлов.
 */
export function getLastModified(): Date {
  const row = getDb()
    .prepare(
      `SELECT MAX(updated_at) AS at FROM (
         SELECT updated_at FROM products
         UNION ALL
         SELECT updated_at FROM categories
       )`,
    )
    .get() as { at: number | null };
  return new Date(row.at ?? Date.now());
}

/**
 * Когда последний раз меняли настройки магазина.
 *
 * Нужна страницам, которые собраны из настроек, а не из каталога:
 * «Доставка и оплата», «Контакты», «О магазине». Раньше им в sitemap
 * подставлялось время сборки — то есть каждый деплой объявлял поиску, что
 * все страницы сайта обновились. Такому lastmod поисковик перестаёт верить
 * целиком, вместе с честными датами товаров.
 *
 * Если настройки через админку ещё не сохраняли, берём дату правки каталога:
 * она тоже настоящая и, главное, не меняется от пересборки.
 */
export function getSiteModified(): Date {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = 'site:updated_at'")
    .get() as { value: string } | undefined;

  const at = row ? Number(row.value) : NaN;
  return Number.isFinite(at) && at > 0 ? new Date(at) : getLastModified();
}

/**
 * Даты правки по адресам страниц — для честного lastmod в sitemap.xml.
 *
 * Раньше на все страницы каталога шла одна дата: время изменения JSON-файла.
 * Теперь у каждого товара своя, и поисковик видит, что правился один товар,
 * а не весь каталог разом.
 */
export function getPageDates(): Map<string, Date> {
  const dates = new Map<string, Date>();

  const products = getDb()
    .prepare("SELECT slug, updated_at FROM products")
    .all() as Array<{ slug: string; updated_at: number }>;
  for (const row of products) {
    dates.set(`/product/${row.slug}/`, new Date(row.updated_at));
  }

  // Адрес подраздела вложенный, поэтому идём через categoryUrl, а не
  // склеиваем строку из slug'а.
  const categoryDates = new Map(
    (
      getDb()
        .prepare("SELECT id, updated_at FROM categories")
        .all() as Array<{ id: string; updated_at: number }>
    ).map((row) => [row.id, row.updated_at]),
  );
  for (const category of load().categories) {
    const at = categoryDates.get(category.id);
    if (at) dates.set(categoryUrl(category), new Date(at));
  }

  return dates;
}
