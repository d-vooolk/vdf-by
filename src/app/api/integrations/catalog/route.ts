import {
  getCategories,
  getCategoryById,
  getProductById,
  getProductBySlug,
  getProductsInCategory,
  getSite,
} from "@/lib/catalog";
import { pickUrl } from "@/lib/image-types";
import { getImage } from "@/lib/images";
import { crmKeyMatches } from "@/lib/integration-key";
import type { Product } from "@/lib/schema";
import { searchProducts } from "@/lib/search";
import { buildSearchIndex } from "@/lib/search-index";
import { hasAnyInStock, priceRange } from "@/lib/variant";

export const dynamic = "force-dynamic";

const SEARCH_LIMIT = 40;
const CATEGORY_LIMIT = 150;
const IDS_LIMIT = 50;
const THUMB_WIDTH = 96;

function absolute(base: string, path: string): string {
  return /^https?:\/\//.test(path) ? path : `${base}${path}`;
}

function toItem(product: Product, base: string) {
  const image = pickUrl(getImage(product.images[0]), THUMB_WIDTH);
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    url: `${base}/product/${product.slug}/`,
    image: image ? absolute(base, image) : null,
    price: priceRange(product).min,
    inStock: hasAnyInStock(product),
    category: getCategoryById(product.categoryId)?.name ?? "",
  };
}

function inStockFirst(products: Product[]): Product[] {
  return [...products].sort((a, b) => Number(hasAnyInStock(b)) - Number(hasAnyInStock(a)));
}

function categoryTree() {
  const categories = getCategories();
  const counts = new Map(categories.map((category) => [category.id, getProductsInCategory(category.id).length]));
  return categories
    .filter((category) => (counts.get(category.id) ?? 0) > 0)
    .map((category) => ({
      id: category.id,
      name: category.menuName || category.name,
      parentId: category.parentId ?? null,
      count: counts.get(category.id) ?? 0,
    }));
}

export function GET(request: Request) {
  if (!crmKeyMatches(request.headers.get("x-integration-key") ?? "")) {
    return Response.json({ error: "forbidden" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const base = getSite().url.replace(/\/+$/, "");
  const query = (params.get("q") ?? "").trim().slice(0, 80);
  const categoryId = params.get("category") ?? "";
  const ids = (params.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, IDS_LIMIT);

  if (ids.length) {
    const products = ids.map(getProductById).filter((product): product is Product => Boolean(product));
    return Response.json({ items: products.map((product) => toItem(product, base)) });
  }

  if (query) {
    const matches = searchProducts(buildSearchIndex(), query, Infinity);
    const products = matches
      .slice(0, SEARCH_LIMIT)
      .map((match) => getProductBySlug(match.s))
      .filter((product): product is Product => Boolean(product));
    return Response.json({ total: matches.length, items: products.map((product) => toItem(product, base)) });
  }

  if (categoryId) {
    if (!getCategoryById(categoryId)) return Response.json({ error: "not found" }, { status: 404 });
    const products = inStockFirst(getProductsInCategory(categoryId));
    return Response.json({
      total: products.length,
      items: products.slice(0, CATEGORY_LIMIT).map((product) => toItem(product, base)),
    });
  }

  return Response.json({ categories: categoryTree() });
}
