import { carPathsForProduct } from "./cars";
import { categoryPaths, invalidateCatalog } from "./catalog";
import { revalidateProduct } from "./revalidate";
import { productsSharingStock } from "./shared-stock";
import { getProductRaw } from "./product-store";

export function revalidateProductsById(ids: Iterable<string>): void {
  for (const id of new Set(ids)) {
    const product = getProductRaw(id);
    if (!product) continue;
    revalidateProduct(product.slug, categoryPaths(product.categoryId), undefined, carPathsForProduct(id));
  }
}

export function revalidateStockMoves(productIds: string[]): void {
  if (!productIds.length) return;
  invalidateCatalog();
  revalidateProductsById(productIds.flatMap((id) => productsSharingStock(id)));
}
