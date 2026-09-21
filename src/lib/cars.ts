import path from "node:path";

import sharp from "sharp";

import { getCategories, getProducts } from "./catalog";
import { bumpCatalogVersion, catalogVersion, getDb } from "./db";
import { processImage } from "./image-pipeline.mjs";
import type { ImageEntry } from "./image-types";
import {
  CARS_ROOT,
  carsRoot,
  generationUrl,
  markUrl,
  modelUrl,
  type CarGeneration,
  type CarMark,
  type CarModel,
  type FitGeneration,
  type FitMark,
  type FitModel,
  type ProductCar,
} from "./car-types";
import { getImage, saveImage } from "./images";
import type { Category, Product } from "./schema";

/**
 * Подбор автосвета по автомобилю.
 *
 * Справочник марок, моделей и поколений лежит в базе целиком (девять тысяч
 * поколений, заливается scripts/import-cars.mjs), но витрина показывает из
 * него только то, к чему привязан хотя бы один товар. Это не оптимизация, а
 * решение про поиск: страница «линзы для Chery Tiggo» без единого товара —
 * это пустая страница, каких Google не любит, и её появление в индексе
 * тянет вниз соседние.
 *
 * Типы, адреса страниц и подписи лежат рядом, в car-types.ts: их нужно и
 * серверу, и браузеру, а всё из этого файла тянет за собой базу и sharp.
 */

/* ------------------------------------------------------------------ */
/* Витрина: только машины, к которым что-то привязано                  */
/* ------------------------------------------------------------------ */

interface TreeRow {
  markId: string;
  markSlug: string;
  markName: string;
  markLogo: string;
  modelId: string;
  modelSlug: string;
  modelName: string;
  modelFrom: number | null;
  modelTo: number | null;
  genId: string;
  genSlug: string;
  genName: string;
  genFrom: number | null;
  genTo: number | null;
  genPhoto: string;
  products: number;
  updatedAt: number;
}

const treeCache = new Map<string, FitMark[]>();
let treeVersion = -1;

export function fitmentCategories(): Category[] {
  return getCategories().filter((category) => category.carFitment);
}

export function isCarFitmentCategory(categoryId: string): boolean {
  return Boolean(
    getDb()
      .prepare(
        `SELECT 1 AS yes FROM categories
          WHERE id = ? AND COALESCE(json_extract(data, '$.carFitment'), 0) = 1`,
      )
      .get(categoryId),
  );
}

function scopeIds(categoryId?: string): string[] {
  const flagged = fitmentCategories().map((category) => category.id);
  if (categoryId === undefined) return flagged;
  return flagged.includes(categoryId) ? [categoryId] : [];
}

/**
 * Дерево «марка → модель → поколение» из живых привязок.
 *
 * Пересобирается вместе с каталогом: привязки правятся только вместе с
 * товаром, а сохранение товара двигает счётчик версий.
 */
export function getCarTree(categoryId?: string): FitMark[] {
  const version = catalogVersion();
  if (treeVersion !== version) {
    treeCache.clear();
    treeVersion = version;
  }

  const key = categoryId ?? "";
  const cached = treeCache.get(key);
  if (cached) return cached;

  const scope = scopeIds(categoryId);
  if (!scope.length) {
    treeCache.set(key, []);
    return [];
  }

  const rows = getDb()
    .prepare(
      `SELECT k.id   AS markId,  k.slug AS markSlug, k.name AS markName,
              k.logo AS markLogo,
              m.id   AS modelId, m.slug AS modelSlug, m.name AS modelName,
              m.year_from AS modelFrom, m.year_to AS modelTo,
              g.id   AS genId,   g.slug AS genSlug,  g.name AS genName,
              g.year_from AS genFrom, g.year_to AS genTo, g.photo AS genPhoto,
              COUNT(pc.product_id) AS products,
              MAX(p.updated_at)    AS updatedAt
         FROM product_cars pc
         JOIN products        p ON p.id = pc.product_id
         JOIN car_generations g ON g.id = pc.generation_id
         JOIN car_models      m ON m.id = g.model_id
         JOIN car_marks       k ON k.id = m.mark_id
        WHERE p.category_id IN (${scope.map(() => "?").join(",")})
        GROUP BY g.id
        ORDER BY k.name, m.name, g.year_from DESC, g.name`,
    )
    .all(...scope) as TreeRow[];

  const marks = new Map<string, FitMark>();
  const models = new Map<string, FitModel>();

  for (const row of rows) {
    let mark = marks.get(row.markId);
    if (!mark) {
      mark = {
        id: row.markId,
        slug: row.markSlug,
        name: row.markName,
        logo: row.markLogo,
        models: [],
        productCount: 0,
      };
      marks.set(row.markId, mark);
    }

    let model = models.get(row.modelId);
    if (!model) {
      model = {
        id: row.modelId,
        markId: row.markId,
        slug: row.modelSlug,
        name: row.modelName,
        yearFrom: row.modelFrom,
        yearTo: row.modelTo,
        generations: [],
        productCount: 0,
      };
      models.set(row.modelId, model);
      mark.models.push(model);
    }

    model.generations.push({
      id: row.genId,
      modelId: row.modelId,
      slug: row.genSlug,
      name: row.genName,
      yearFrom: row.genFrom,
      yearTo: row.genTo,
      photo: row.genPhoto,
      productCount: row.products,
      updatedAt: row.updatedAt,
    });

    // Один товар подходит к нескольким поколениям одной модели сплошь и
    // рядом, поэтому это сумма привязок, а не число разных товаров. Для
    // подписи на плитке марки этого достаточно, а считать точно значило бы
    // держать в памяти все привязки целиком.
    model.productCount += row.products;
    mark.productCount += row.products;
  }

  const tree = [...marks.values()];
  treeCache.set(key, tree);
  return tree;
}

export function findMark(
  slug: string,
  categoryId?: string,
): FitMark | undefined {
  return getCarTree(categoryId).find((mark) => mark.slug === slug);
}

export function findModel(mark: FitMark, slug: string): FitModel | undefined {
  return mark.models.find((model) => model.slug === slug);
}

export function findGeneration(
  model: FitModel,
  slug: string,
): FitGeneration | undefined {
  return model.generations.find((generation) => generation.slug === slug);
}

function inScope(categoryId?: string): (product: Product) => boolean {
  const scope = new Set(scopeIds(categoryId));
  return (product) => scope.has(product.categoryId);
}

function productsByIds(ids: Set<string>, categoryId?: string): Product[] {
  const allowed = inScope(categoryId);
  return getProducts().filter(
    (product) => ids.has(product.id) && allowed(product),
  );
}

/** Товары, подходящие к поколению, — в том же порядке, что и в каталоге. */
export function getProductsForGeneration(
  generationId: string,
  categoryId?: string,
): Product[] {
  const ids = new Set(
    (
      getDb()
        .prepare("SELECT product_id FROM product_cars WHERE generation_id = ?")
        .all(generationId) as Array<{ product_id: string }>
    ).map((row) => row.product_id),
  );
  return productsByIds(ids, categoryId);
}

/** Товары всех поколений модели — для страницы модели. */
export function getProductsForModel(
  modelId: string,
  categoryId?: string,
): Product[] {
  const ids = new Set(
    (
      getDb()
        .prepare(
          `SELECT DISTINCT pc.product_id
             FROM product_cars pc
             JOIN car_generations g ON g.id = pc.generation_id
            WHERE g.model_id = ?`,
        )
        .all(modelId) as Array<{ product_id: string }>
    ).map((row) => row.product_id),
  );
  return productsByIds(ids, categoryId);
}

/** Все товары марки — для страницы марки, где поколение ещё не выбрано. */
export function getProductsForMark(
  markId: string,
  categoryId?: string,
): Product[] {
  const ids = new Set(
    (
      getDb()
        .prepare(
          `SELECT DISTINCT pc.product_id
             FROM product_cars pc
             JOIN car_generations g ON g.id = pc.generation_id
             JOIN car_models      m ON m.id = g.model_id
            WHERE m.mark_id = ?`,
        )
        .all(markId) as Array<{ product_id: string }>
    ).map((row) => row.product_id),
  );
  return productsByIds(ids, categoryId);
}

export interface CarCategoryGroup {
  category: Category;
  products: Product[];
}

export function groupByCategory(products: Product[]): CarCategoryGroup[] {
  const groups: CarCategoryGroup[] = [];

  for (const category of getCategories()) {
    const inCategory = products.filter(
      (product) => product.categoryId === category.id,
    );
    if (inCategory.length) groups.push({ category, products: inCategory });
  }

  return groups;
}

/**
 * Машины, к которым привязан товар, — для блока «Подходит к автомобилям» на
 * странице товара.
 *
 * Блок не украшение: ссылки из него и делают страницы подбора видимыми для
 * поисковика. Страница, на которую нет ни одной внутренней ссылки, живёт
 * только в sitemap, а этого мало.
 */
export function getProductCars(productId: string): ProductCar[] {
  return getDb()
    .prepare(
      `SELECT k.slug AS markSlug, k.name AS markName,
              m.slug AS modelSlug, m.name AS modelName,
              g.id   AS generationId, g.slug AS generationSlug,
              g.name AS generationName,
              g.year_from AS yearFrom, g.year_to AS yearTo
         FROM product_cars pc
         JOIN car_generations g ON g.id = pc.generation_id
         JOIN car_models      m ON m.id = g.model_id
         JOIN car_marks       k ON k.id = m.mark_id
        WHERE pc.product_id = ?
        ORDER BY k.name, m.name, g.year_from DESC`,
    )
    .all(productId) as ProductCar[];
}

/**
 * Адреса страниц подбора, которых касается товар, — для сброса кеша.
 * Вместе со страницами марки и модели: там стоят счётчики позиций.
 */
export function carPathsForProduct(productId: string): string[] {
  const paths = new Set<string>();
  const row = getDb()
    .prepare(
      `SELECT c.slug AS slug
         FROM products p JOIN categories c ON c.id = p.category_id
        WHERE p.id = ?
          AND COALESCE(json_extract(c.data, '$.carFitment'), 0) = 1`,
    )
    .get(productId) as { slug: string } | undefined;

  const bases = [CARS_ROOT, ...(row ? [carsRoot(row.slug)] : [])];

  for (const car of getProductCars(productId)) {
    for (const base of bases) {
      paths.add(markUrl(car.markSlug, base));
      paths.add(modelUrl(car.markSlug, car.modelSlug, base));
      paths.add(
        generationUrl(car.markSlug, car.modelSlug, car.generationSlug, base),
      );
    }
  }

  return [...paths];
}

function collectCarDates(
  dates: Map<string, Date>,
  tree: FitMark[],
  base: string,
): void {
  for (const mark of tree) {
    let markAt = 0;
    for (const model of mark.models) {
      let modelAt = 0;
      for (const generation of model.generations) {
        dates.set(
          generationUrl(mark.slug, model.slug, generation.slug, base),
          new Date(generation.updatedAt),
        );
        modelAt = Math.max(modelAt, generation.updatedAt);
      }
      dates.set(modelUrl(mark.slug, model.slug, base), new Date(modelAt));
      markAt = Math.max(markAt, modelAt);
    }
    dates.set(markUrl(mark.slug, base), new Date(markAt));
  }
}

/** Даты правки страниц подбора — для честного lastmod в sitemap.xml. */
export function getCarPageDates(): Map<string, Date> {
  const dates = new Map<string, Date>();

  collectCarDates(dates, getCarTree(), CARS_ROOT);

  for (const category of fitmentCategories()) {
    collectCarDates(
      dates,
      getCarTree(category.id),
      carsRoot(category.slug),
    );
  }

  return dates;
}

/* ------------------------------------------------------------------ */
/* Админка: весь справочник и привязки                                 */
/* ------------------------------------------------------------------ */

export function listMarks(): CarMark[] {
  return getDb()
    .prepare("SELECT id, slug, name, logo FROM car_marks ORDER BY name")
    .all() as CarMark[];
}

export function listModels(markId: string): CarModel[] {
  return getDb()
    .prepare(
      `SELECT id, mark_id AS markId, slug, name,
              year_from AS yearFrom, year_to AS yearTo
         FROM car_models WHERE mark_id = ? ORDER BY name`,
    )
    .all(markId) as CarModel[];
}

export function listGenerations(modelId: string): CarGeneration[] {
  return getDb()
    .prepare(
      `SELECT id, model_id AS modelId, slug, name,
              year_from AS yearFrom, year_to AS yearTo, photo
         FROM car_generations WHERE model_id = ?
        ORDER BY year_from DESC, name`,
    )
    .all(modelId) as CarGeneration[];
}

/**
 * Переписывает привязки товара целиком.
 *
 * Не «добавить» и «убрать» по одной, а разом: форма и так присылает готовый
 * список, а разница между ним и базой — это лишний повод разъехаться.
 * Несуществующие поколения молча отбрасываются: список приходит из формы,
 * то есть с публичной точки входа, и доверия ему не больше, чем всему
 * остальному в saveProduct.
 */
export function setProductCars(
  productId: string,
  generationIds: string[],
): void {
  const db = getDb();
  const known = db.prepare("SELECT id FROM car_generations WHERE id = ?");
  const wanted = [...new Set(generationIds)].filter((id) => known.get(id));

  const remove = db.prepare("DELETE FROM product_cars WHERE product_id = ?");
  const add = db.prepare(
    "INSERT OR IGNORE INTO product_cars (product_id, generation_id) VALUES (?, ?)",
  );

  db.transaction(() => {
    remove.run(productId);
    for (const id of wanted) add.run(productId, id);
  })();

  // Страницы подбора собраны из привязок, а снимок дерева сверяется с тем же
  // счётчиком, что и каталог. Без этого правка привязок осталась бы видна
  // только после следующего сохранения товара.
  bumpCatalogVersion();
}

/* ------------------------------------------------------------------ */
/* Картинки справочника                                                */
/* ------------------------------------------------------------------ */

/**
 * Забирает логотип марки и фотографию поколения в свой манифест.
 *
 * Картинки справочника лежат на чужом сервере, а мы их скачиваем и
 * прогоняем через общий конвейер. Причин две. Первая — политика
 * безопасности сайта запрещает загружать изображения с посторонних доменов
 * (img-src 'self'), и ослаблять её ради иконок не стоит. Вторая — чужой
 * адрес может перестать отвечать в любой день, и тогда на витрине окажется
 * сетка битых картинок.
 *
 * Забираем по требованию, в момент привязки товара к машине: из девяти
 * тысяч поколений магазину нужны единицы.
 *
 * Ошибки наверх не поднимаются: не скачалась картинка — на её месте будет
 * та же аккуратная заглушка, что и у товара без фото. Ронять из-за этого
 * сохранение товара нельзя.
 */
export async function fetchCarImages(generationIds: string[]): Promise<void> {
  if (!generationIds.length) return;

  const db = getDb();
  const placeholders = generationIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT g.id AS genId, g.photo AS genPhoto, g.photo_src AS genSrc,
              k.id AS markId, k.slug AS markSlug, k.logo AS markLogo,
              k.logo_src AS markSrc
         FROM car_generations g
         JOIN car_models m ON m.id = g.model_id
         JOIN car_marks  k ON k.id = m.mark_id
        WHERE g.id IN (${placeholders})`,
    )
    .all(...generationIds) as Array<{
    genId: string;
    genPhoto: string;
    genSrc: string;
    markId: string;
    markSlug: string;
    markLogo: string;
    markSrc: string;
  }>;

  const setPhoto = db.prepare(
    "UPDATE car_generations SET photo = ? WHERE id = ?",
  );
  const setLogo = db.prepare("UPDATE car_marks SET logo = ? WHERE id = ?");
  const doneMarks = new Set<string>();

  for (const row of rows) {
    if (!row.genPhoto && row.genSrc) {
      const stored = await download(row.genSrc, `cars/gen/${row.genId}.jpg`);
      if (stored) setPhoto.run(stored, row.genId);
    }

    if (!row.markLogo && row.markSrc && !doneMarks.has(row.markId)) {
      doneMarks.add(row.markId);
      const stored = await download(
        row.markSrc,
        `cars/mark/${row.markSlug}.jpg`,
        true,
      );
      if (stored) setLogo.run(stored, row.markId);
    }
  }
}

/**
 * @param flatten логотипы приходят прозрачными png, и jpeg-фолбэк из такого
 * файла получается с чёрным фоном. Заливаем прозрачность белым заранее —
 * под плитками справочника фон всё равно белый.
 */
async function download(
  url: string,
  relativePath: string,
  flatten = false,
): Promise<string> {
  if (getImage(relativePath)) return relativePath;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return "";

    let source = Buffer.from(await response.arrayBuffer());
    if (flatten) {
      source = await sharp(source)
        .flatten({ background: "#ffffff" })
        .png()
        .toBuffer();
    }

    const result = await processImage({
      source,
      relativePath,
      outDir: path.join(process.cwd(), "public", "img"),
      sharp,
    });
    if (!result) return "";

    saveImage(relativePath, result.entry as ImageEntry, result.bytes);
    return relativePath;
  } catch {
    return "";
  }
}
