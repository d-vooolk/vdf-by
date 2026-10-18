import { cache } from "react";

import { isFrameCategory } from "./frame-category";
import { frameMembershipsIn } from "./frame-membership";
import { productViewCounts } from "./product-views";
import type { Category, Product } from "./schema";
import { hasAnyInStock } from "./variant";

const membershipsOf = cache((categoryId: string) => frameMembershipsIn(categoryId));
const viewCounts = cache(() => productViewCounts());

interface TypeGroup {
  first: number;
  views: number;
  members: Array<{ product: Product; index: number; views: number }>;
}

function representative(group: TypeGroup): Product {
  return [...group.members].sort(
    (a, b) =>
      Number(hasAnyInStock(b.product)) - Number(hasAnyInStock(a.product)) ||
      b.views - a.views ||
      a.index - b.index,
  )[0].product;
}

export function listingProducts(category: Category, products: Product[]): Product[] {
  if (!category.frameTypes || !isFrameCategory(category.id)) return products;
  const types = membershipsOf(category.id);
  const views = viewCounts();
  const groups = new Map<string, TypeGroup>();

  products.forEach((product, index) => {
    const productViews = views.get(product.id) ?? 0;
    const key = types.get(product.id) ?? `product:${product.id}`;
    const group = groups.get(key) ?? { first: index, views: 0, members: [] };
    group.views += productViews;
    group.members.push({ product, index, views: productViews });
    groups.set(key, group);
  });

  return [...groups.values()]
    .sort((a, b) => b.views - a.views || a.first - b.first)
    .map(representative);
}
