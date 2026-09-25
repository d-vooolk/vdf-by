import type { Product } from "./schema";
import { hasAnyInStock, priceRange } from "./variant";

export const PER_PAGE = 60;

export const SORT_LABELS = {
  default: "По умолчанию",
  "price-asc": "Сначала дешевле",
  "price-desc": "Сначала дороже",
  name: "По названию",
} as const;

export type SortKey = keyof typeof SORT_LABELS;

export interface ListingParams {
  page?: string | string[];
  sort?: string | string[];
}

export interface ListingState {
  page: number;
  sort: SortKey;
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function isSortKey(value: string): value is SortKey {
  return Object.hasOwn(SORT_LABELS, value);
}

export function readListing(params: ListingParams): ListingState {
  const page = Math.floor(Number(single(params.page)));
  const sort = single(params.sort);
  return {
    page: Number.isFinite(page) && page > 1 ? page : 1,
    sort: isSortKey(sort) ? sort : "default",
  };
}

export function sortProducts(products: Product[], sort: SortKey): Product[] {
  const entries = products.map((product, order) => ({
    product,
    order,
    inStock: hasAnyInStock(product),
    price: priceRange(product).min,
  }));
  entries.sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    const pricedA = a.price > 0;
    const pricedB = b.price > 0;
    if ((sort === "price-asc" || sort === "price-desc") && pricedA !== pricedB) {
      return pricedA ? -1 : 1;
    }
    switch (sort) {
      case "price-asc":
        return a.price - b.price || a.order - b.order;
      case "price-desc":
        return b.price - a.price || a.order - b.order;
      case "name":
        return a.product.title.localeCompare(b.product.title, "ru");
      default:
        return a.order - b.order;
    }
  });
  return entries.map((entry) => entry.product);
}

export function clampPage(total: number, page: number): number {
  return Math.min(page, Math.max(1, Math.ceil(total / PER_PAGE)));
}

export function listingPage(products: Product[], state: ListingState) {
  const pages = Math.max(1, Math.ceil(products.length / PER_PAGE));
  const page = clampPage(products.length, state.page);
  const sorted = sortProducts(products, state.sort);
  return {
    items: sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    page,
    pages,
    total: products.length,
  };
}

export function listingHref(basePath: string, page: number, sort: SortKey): string {
  const search = new URLSearchParams();
  if (page > 1) search.set("page", String(page));
  if (sort !== "default") search.set("sort", sort);
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}
