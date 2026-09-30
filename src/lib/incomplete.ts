import { getDb } from "./db";
import { frameCategories } from "./frame-category";
import { ensureFrameMembership } from "./frame-membership";
import type { Product } from "./schema";

export const GAPS = {
  price: "нет цены",
  wholesale: "нет оптовой цены",
  description: "нет описания",
  photo: "нет фото",
  faq: "нет вопросов-ответов",
  cars: "не привязан к авто",
  frameType: "не привязан к типу рамки",
  twin: "название как у другого товара",
} as const;

export type Gap = keyof typeof GAPS;

export function isGap(value: unknown): value is Gap {
  return typeof value === "string" && value in GAPS;
}

export interface IncompleteProduct {
  id: string;
  title: string;
  sku: string;
  categoryId: string;
  image: string | null;
  updatedAt: number;
  gaps: Gap[];
  twins: TwinProduct[];
}

export interface TwinProduct {
  id: string;
  sku: string;
}

function gapsOf(product: Partial<Product>, carFitment: boolean, cars: number): Gap[] {
  const values = (product.optionGroups ?? []).flatMap((group) => group.values);
  const gaps: Gap[] = [];
  if (!((product.price ?? 0) > 0 || values.some((value) => (value.price ?? 0) > 0))) {
    gaps.push("price");
  }
  if (product.inStock !== false && !((product.wholesalePrice ?? 0) > 0)) gaps.push("wholesale");
  if (!product.description?.trim()) gaps.push("description");
  if (!product.images?.length && !values.some((value) => value.images?.length)) {
    gaps.push("photo");
  }
  if (!product.faq?.length) gaps.push("faq");
  if (carFitment && cars === 0) gaps.push("cars");
  return gaps;
}

export function listIncompleteProducts(): IncompleteProduct[] {
  ensureFrameMembership();
  const frameCategoryIds = new Set(frameCategories().map((category) => category.id));
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.title, p.category_id AS categoryId, p.data, p.updated_at AS updatedAt,
              COALESCE(json_extract(c.data, '$.carFitment'), 0) AS carFitment,
              (SELECT COUNT(*) FROM product_cars pc WHERE pc.product_id = p.id) AS cars,
              EXISTS (SELECT 1 FROM frame_type_products f
                       WHERE f.product_id = p.id AND f.category_id = p.category_id) AS framed
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
        ORDER BY p.updated_at DESC`,
    )
    .all() as Array<{
    id: string;
    title: string;
    categoryId: string;
    data: string;
    updatedAt: number;
    carFitment: number;
    cars: number;
    framed: number;
  }>;

  const titleKey = (title: string) => title.replace(/\s+/g, " ").trim().toLowerCase();
  const products = rows.map((row) => ({ row, product: JSON.parse(row.data) as Partial<Product> }));
  const sameTitle = new Map<string, TwinProduct[]>();
  for (const { row, product } of products) {
    const key = titleKey(row.title);
    sameTitle.set(key, [...(sameTitle.get(key) ?? []), { id: row.id, sku: product.sku ?? "" }]);
  }

  return products.flatMap(({ row, product }) => {
    const gaps = gapsOf(product, row.carFitment === 1, row.cars);
    if (frameCategoryIds.has(row.categoryId) && row.framed === 0) gaps.push("frameType");
    const twins = (sameTitle.get(titleKey(row.title)) ?? []).filter((twin) => twin.id !== row.id);
    if (twins.length) gaps.push("twin");
    if (!gaps.length) return [];
    return [
      {
        id: row.id,
        title: row.title,
        sku: product.sku ?? "",
        categoryId: row.categoryId,
        image: product.images?.[0] ?? null,
        updatedAt: row.updatedAt,
        gaps,
        twins,
      },
    ];
  });
}
