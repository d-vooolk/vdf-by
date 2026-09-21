import { getCategoryById, getProducts } from "@/lib/catalog";
import { pickUrl } from "@/lib/image-types";
import { getImage } from "@/lib/images";
import { normalize, type SearchEntry } from "@/lib/search";
import { hasAnyInStock, priceRange } from "@/lib/variant";

/**
 * Индекс для поиска по каталогу.
 *
 * Лежит отдельным файлом и качается только когда пользователь коснулся поля
 * поиска: на скорость главной и каталога он не влияет вообще. Сторонний
 * поисковый сервис при 300–1000 товарах не нужен — фильтрация массива в
 * браузере занимает доли миллисекунды.
 */
export const dynamic = "force-static";

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

export function GET() {
  const entries: SearchEntry[] = getProducts().map((product) => {
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

  return Response.json(entries);
}
