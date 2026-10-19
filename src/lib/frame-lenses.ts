import { cache } from "react";

import { categoryCollections, collectionUrl, categoryUrl, getCategoryBySlug, getProductsInCollection } from "./catalog";
import { productViewCounts } from "./product-views";
import type { Category, CategoryCollection, Product } from "./schema";
import { hasAnyInStock } from "./variant";

const LENS_CATEGORY_SLUG = "bi-led-moduli";
const LENS_LIMIT = 4;

type LensSize = "linzy-3-0" | "linzy-2-5";

export interface FrameLenses {
  category: Category;
  categoryHref: string;
  collection: CategoryCollection;
  collectionHref: string;
  collectionCount: number;
  products: Product[];
}

function lensSizeOf(title: string): LensSize | null {
  if (/птф/i.test(title)) return null;
  if (/наборн|matrix/i.test(title) && !/hella\s*3/i.test(title)) return null;
  if (/2[.,]5/.test(title)) return "linzy-2-5";
  return "linzy-3-0";
}

function dominantSize(titles: string[]): LensSize | null {
  const counts = new Map<LensSize, number>();
  for (const title of titles) {
    const size = lensSizeOf(title);
    if (size) counts.set(size, (counts.get(size) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

const views = cache(() => productViewCounts());

function lensesOfSize(size: LensSize): FrameLenses | null {
  const category = getCategoryBySlug(LENS_CATEGORY_SLUG);
  if (!category) return null;
  const collection = categoryCollections(category).find((entry) => entry.slug === size);
  if (!collection) return null;
  const all = getProductsInCollection(category, collection);
  const popularity = views();
  const products = all
    .map((product, index) => ({ product, index }))
    .filter(({ product }) => hasAnyInStock(product))
    .sort(
      (a, b) => (popularity.get(b.product.id) ?? 0) - (popularity.get(a.product.id) ?? 0) || a.index - b.index,
    )
    .slice(0, LENS_LIMIT)
    .map(({ product }) => product);
  if (!products.length) return null;
  return {
    category,
    categoryHref: categoryUrl(category),
    collection,
    collectionHref: collectionUrl(category, collection),
    collectionCount: all.length,
    products,
  };
}

export function lensesForFrames(frames: Array<Pick<Product, "title">>): FrameLenses | null {
  const size = dominantSize(frames.map((frame) => frame.title));
  return size ? lensesOfSize(size) : null;
}
