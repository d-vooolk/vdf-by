import { getCategoryById, getProducts } from "./catalog";
import { pickUrl } from "./image-types";
import { getImage } from "./images";
import type { Product } from "./schema";
import { normalize, type SearchEntry } from "./search";
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

export function buildSearchIndex(): SearchEntry[] {
  const products = getProducts();
  if (cache?.products === products) return cache.entries;

  const entries: SearchEntry[] = products.map((product) => {
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
      product.specs.map((spec) => `${spec.name} ${spec.value}`).join(" "),
      product.optionGroups
        .flatMap((group) => group.values.map((value) => value.label))
        .join(" "),
      product.sku ?? "",
    ].join(" ");

    return {
      s: product.slug,
      t: product.title,
      ...(product.brand ? { b: product.brand } : {}),
      c: category?.name ?? "",
      p: priceRange(product).min,
      a: hasAnyInStock(product) ? 1 : 0,
      ...(entry ? { i: pickUrl(entry, 96) ?? undefined } : {}),
      q: dedupeWords(normalize(haystack)),
    };
  });

  cache = { products, entries };
  return entries;
}
