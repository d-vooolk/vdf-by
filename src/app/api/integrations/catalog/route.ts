import { categoryFilterOptions, listCategoriesBrief } from "@/lib/category-store";
import {
  getCategoryById,
  getProductById,
  getProductBySlug,
  getProductsInCategory,
  getSite,
} from "@/lib/catalog";
import { pickUrl } from "@/lib/image-types";
import { getImage } from "@/lib/images";
import { isFrameCategory } from "@/lib/frame-category";
import { frameMembershipsIn } from "@/lib/frame-membership";
import { crmKeyMatches } from "@/lib/integration-key";
import type { Product } from "@/lib/schema";
import { searchProducts } from "@/lib/search";
import { buildSearchIndex } from "@/lib/search-index";
import { hasAnyInStock, priceRange } from "@/lib/variant";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;
const MAX_OFFSET = 10_000;
const IDS_LIMIT = 50;
const THUMB_WIDTH = 96;
const FRAME_TITLE_PREFIX = /^.*?\sфар(?:ах|ы|у|е)?\s+/i;
const MARKS_PREVIEW = 3;

function frameCarLabel(title: string): string {
  const label = title.replace(FRAME_TITLE_PREFIX, "").trim();
  return label || title;
}

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
  const categories = listCategoriesBrief();
  const totals = new Map(categoryFilterOptions(categories).map((option) => [option.id, option.count]));
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    count: totals.get(category.id) ?? 0,
    frameTypes: isFrameCategory(category.id),
  }));
}

function frameTypeList(categoryId: string) {
  const byType = new Map<string, string[]>();
  for (const [productId, type] of frameMembershipsIn(categoryId)) {
    const product = getProductById(productId);
    if (product) byType.set(type, [...(byType.get(type) ?? []), frameCarLabel(product.title)]);
  }
  return [...byType]
    .map(([type, cars]) => ({
      type,
      count: cars.length,
      marks: [...new Set(cars.map((car) => car.split(" ")[0]))].sort((a, b) => a.localeCompare(b, "ru")).slice(0, MARKS_PREVIEW),
    }))
    .sort((a, b) => a.type.localeCompare(b.type, "ru", { numeric: true }));
}

function frameTypeProducts(categoryId: string, type: string, base: string) {
  const products: Product[] = [];
  for (const [productId, productType] of frameMembershipsIn(categoryId)) {
    if (productType !== type) continue;
    const product = getProductById(productId);
    if (product) products.push(product);
  }
  return products
    .map((product) => ({ ...toItem(product, base), car: frameCarLabel(product.title) }))
    .sort((a, b) => a.car.localeCompare(b.car, "ru", { numeric: true }));
}

function page<T>(items: T[], offset: number): { total: number; items: T[] } {
  return { total: items.length, items: items.slice(offset, offset + PAGE_SIZE) };
}

export function GET(request: Request) {
  if (!crmKeyMatches(request.headers.get("x-integration-key") ?? "")) {
    return Response.json({ error: "forbidden" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const base = getSite().url.replace(/\/+$/, "");
  const query = (params.get("q") ?? "").trim().slice(0, 80);
  const categoryId = params.get("category") ?? "";
  const offset = Math.min(MAX_OFFSET, Math.max(0, Math.floor(Number(params.get("offset")) || 0)));
  const ids = (params.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, IDS_LIMIT);

  if (ids.length) {
    const products = ids.map(getProductById).filter((product): product is Product => Boolean(product));
    return Response.json({ items: products.map((product) => toItem(product, base)) });
  }

  if (query) {
    const matches = page(searchProducts(buildSearchIndex(), query, Infinity), offset);
    const products = matches.items
      .map((match) => getProductBySlug(match.s))
      .filter((product): product is Product => Boolean(product));
    return Response.json({ total: matches.total, items: products.map((product) => toItem(product, base)) });
  }

  if (categoryId) {
    if (!getCategoryById(categoryId)) return Response.json({ error: "not found" }, { status: 404 });
    const frameType = (params.get("type") ?? "").trim().slice(0, 20);
    if (frameType && isFrameCategory(categoryId)) {
      const items = frameTypeProducts(categoryId, frameType, base);
      return Response.json({ total: items.length, items });
    }
    if (params.has("types") && isFrameCategory(categoryId)) {
      return Response.json({ types: frameTypeList(categoryId) });
    }
    const products = page(inStockFirst(getProductsInCategory(categoryId)), offset);
    return Response.json({ total: products.total, items: products.items.map((product) => toItem(product, base)) });
  }

  return Response.json({ categories: categoryTree() });
}
