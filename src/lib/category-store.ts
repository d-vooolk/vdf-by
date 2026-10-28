import { bumpCatalogVersion, getDb } from "./db";
import { pluralize } from "./format";
import { forgetRedirectsTo, rememberRedirect } from "./redirects";
import { deepTrim } from "./text";
import {
  categorySchema,
  parseOrThrow,
  type Category,
  type Product,
} from "./schema";
import { SaveResult, describe } from "./store";

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
export function categoryPath(slug: string, parentId: string | null): string {
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
export function checkParent(
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
      .prepare(
        `SELECT id, parent_id,
                json_extract(data, '$.carFitment') AS carFitment
           FROM categories WHERE id = ?`,
      )
      .get(category.parentId) as
      | { id: string; parent_id: string | null; carFitment: number | null }
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
    if (parent.carFitment) {
      problems.push(
        `Раздел «${parent.id}» связан с автомобилями, и второй сегмент его адреса занят маркой машины. ` +
          "Подраздела у него быть не может — сначала снимите привязку к авто.",
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

export function checkCarFitment(category: Category, previousId?: string): string[] {
  if (!category.carFitment) return [];

  const problems: string[] = [];

  if (category.parentId) {
    problems.push(
      "Связать с автомобилями можно только раздел верхнего уровня: у подраздела " +
        "страницы подбора ушли бы на пятый уровень вложенности, а поиск такие адреса почти не обходит.",
    );
  }

  const { n: children } = getDb()
    .prepare("SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?")
    .get(previousId ?? category.id) as { n: number };

  if (children > 0) {
    problems.push(
      `У раздела ${pluralize(children, "подраздел", "подраздела", "подразделов")}. ` +
        "Второй сегмент адреса не может быть одновременно подразделом и маркой машины — " +
        "перенесите подразделы или снимите привязку к авто.",
    );
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
export function checkCollections(category: Category, previousId?: string): string[] {
  const slugs = (category.collections ?? []).map((collection) => collection.slug);
  const problems: string[] = [];
  if (new Set(slugs).size !== slugs.length) problems.push("Адреса подборок повторяются");
  const children = getDb()
    .prepare("SELECT slug FROM categories WHERE parent_id = ?")
    .all(previousId ?? category.id) as Array<{ slug: string }>;
  for (const child of children) {
    if (slugs.includes(child.slug)) problems.push(`Адрес подборки «${child.slug}» занят подразделом`);
  }
  return problems;
}

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
  problems.push(...checkCarFitment(category, previousId));
  problems.push(...checkCollections(category, previousId));

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

/** Списки для выпадающих меню админки — без разбора всего каталога схемой. */
export interface CategoryBrief {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  /** Товаров непосредственно в этом разделе, без подразделов. */
  count: number;
  children: number;
  carFitment: boolean;
  image: string | null;
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
              (SELECT COUNT(*) FROM categories k WHERE k.parent_id = c.id) AS children,
              COALESCE(json_extract(c.data, '$.carFitment'), 0) AS carFitment,
              json_extract(c.data, '$.image') AS image
         FROM categories c
        ORDER BY c.sort_order, c.name`,
    )
    .all()
    .map((row) => {
      const entry = row as Omit<CategoryBrief, "carFitment"> & {
        carFitment: number;
      };
      return { ...entry, carFitment: Boolean(entry.carFitment) };
    });

  const roots = rows.filter((row) => !row.parentId);
  return roots.flatMap((root) => [
    root,
    ...rows.filter((row) => row.parentId === root.id),
  ]);
}

export interface CategoryListRow extends CategoryBrief {
  order: number | null;
  excerpt: string;
  url: string;
}

export function listCategoryRows(): CategoryListRow[] {
  const extras = new Map(
    (
      getDb()
        .prepare(
          `SELECT id, sort_order AS sortOrder, COALESCE(json_extract(data, '$.excerpt'), '') AS excerpt
             FROM categories`,
        )
        .all() as Array<{ id: string; sortOrder: number | null; excerpt: string }>
    ).map((row) => [row.id, row]),
  );
  const brief = listCategoriesBrief();
  const slugs = new Map(brief.map((category) => [category.id, category.slug]));
  return brief.map((category) => {
    const parentSlug = category.parentId ? slugs.get(category.parentId) : undefined;
    return {
      ...category,
      order: extras.get(category.id)?.sortOrder ?? null,
      excerpt: extras.get(category.id)?.excerpt ?? "",
      url: parentSlug ? `/catalog/${parentSlug}/${category.slug}/` : `/catalog/${category.slug}/`,
    };
  });
}

export interface CategoryFilterOption {
  id: string;
  label: string;
  count: number;
}

const CHILD_INDENT = "    └ ";

export function categoryFilterOptions(
  categories: CategoryBrief[],
  countOf: (category: CategoryBrief) => number = (category) => category.count,
): CategoryFilterOption[] {
  const own = new Map(categories.map((category) => [category.id, countOf(category)]));
  return categories.map((category) => ({
    id: category.id,
    label: category.parentId ? `${CHILD_INDENT}${category.name}` : category.name,
    count: categories
      .filter((child) => child.parentId === category.id)
      .reduce((sum, child) => sum + (own.get(child.id) ?? 0), own.get(category.id) ?? 0),
  }));
}

export function categoryWithChildren(categories: CategoryBrief[], categoryId: string): Set<string> {
  return new Set([
    categoryId,
    ...categories.filter((category) => category.parentId === categoryId).map((category) => category.id),
  ]);
}

export function getCategoryRaw(id: string): Category | null {
  const row = getDb()
    .prepare("SELECT data FROM categories WHERE id = ?")
    .get(id) as { data: string } | undefined;
  return row
    ? parseOrThrow(categorySchema, JSON.parse(row.data), `раздел ${id}`)
    : null;
}
