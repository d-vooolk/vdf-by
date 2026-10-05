import { getCategoryById, getProducts } from "./catalog";
import { getDb } from "./db";
import { frameTypesByProduct, specsWithFrameType } from "./frame-membership";
import { pickUrl } from "./image-types";
import { getImage } from "./images";
import type { Product } from "./schema";
import { codeForms, normalize, type SearchEntry } from "./search";
import { hasAnyInStock, priceRange } from "./variant";

function dedupeWords(text: string): string {
  const seen = new Set<string>();
  const words: string[] = [];

  for (const word of text.split(" ")) {
    if (!word || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
  }

  return words.join(" ");
}

let cache: { products: Product[]; entries: SearchEntry[] } | null = null;

function supplierArticles(): Map<string, string[]> {
  const rows = getDb().prepare("SELECT product_id AS productId, article FROM vdf_articles").all() as Array<{
    productId: string;
    article: string;
  }>;
  const byProduct = new Map<string, string[]>();
  for (const row of rows) {
    byProduct.set(row.productId, [...(byProduct.get(row.productId) ?? []), row.article]);
  }
  return byProduct;
}

function productCodes(product: Product, supplier: string[]): string[] {
  return [
    product.sku,
    ...product.optionGroups.flatMap((group) => group.values.map((value) => value.sku)),
    ...supplier,
  ].filter((code): code is string => Boolean(code?.trim()));
}

export function buildSearchIndex(): SearchEntry[] {
  const products = getProducts();
  if (cache?.products === products) return cache.entries;

  const articles = supplierArticles();
  const frameTypes = frameTypesByProduct();

  const entries: SearchEntry[] = products.map((product) => {
    const codes = productCodes(product, articles.get(product.id) ?? []);
    const compactCodes = dedupeWords(codes.flatMap(codeForms).filter(Boolean).join(" "));
    const category = getCategoryById(product.categoryId);
    // Родитель — тоже слово, по которому будут искать: товар из
    // «Декоративных масок» должен находиться по запросу «аксессуары».
    const parent = category?.parentId
      ? getCategoryById(category.parentId)
      : undefined;
    const entry = getImage(product.images[0]);

    // Всё, по чему имеет смысл искать, склеивается в одну строку: название,
    // бренд, категория, описание целиком, характеристики и подписи опций
    // (цоколя!).
    const haystack = [
      product.title,
      product.brand ?? "",
      category?.name ?? "",
      parent?.name ?? "",
      product.description ?? "",
      specsWithFrameType(product.specs, frameTypes.get(product.id)).map((spec) => `${spec.name} ${spec.value}`).join(" "),
      product.optionGroups
        .flatMap((group) => group.values.map((value) => value.label))
        .join(" "),
      codes.join(" "),
    ].join(" ");

    return {
      s: product.slug,
      t: product.title,
      ...(product.brand ? { b: product.brand } : {}),
      c: category?.name ?? "",
      p: priceRange(product).min,
      a: hasAnyInStock(product) ? 1 : 0,
      ...(entry ? { i: pickUrl(entry, 96) ?? undefined } : {}),
      ...(compactCodes ? { k: compactCodes } : {}),
      q: dedupeWords(normalize(haystack)),
    };
  });

  cache = { products, entries };
  return entries;
}
