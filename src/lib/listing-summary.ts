import { brandsOf } from "./catalog";
import { formatPrice, pluralize } from "./format";
import type { Product } from "./schema";
import { hasAnyInStock, hasPrice, priceRange } from "./variant";

export interface ListingSummary {
  total: number;
  available: number;
  minPrice: number;
  maxPrice: number;
  brands: string[];
}

export function summarize(products: Product[]): ListingSummary {
  const prices = products.flatMap((product) => {
    const range = priceRange(product);
    return [range.min, range.max].filter(hasPrice);
  });
  return {
    total: products.length,
    available: products.filter(hasAnyInStock).length,
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    brands: brandsOf(products),
  };
}

export function summaryLines(summary: ListingSummary, currencySymbol: string): string[] {
  const lines: string[] = [];
  const count = pluralize(summary.total, "позиция", "позиции", "позиций");
  lines.push(
    summary.available === summary.total
      ? `${count}, все в наличии`
      : summary.available > 0
        ? `${count}, из них ${summary.available} в наличии`
        : `${count}, сейчас нет в наличии — уточните срок поступления по телефону`,
  );
  if (summary.minPrice) {
    lines.push(
      summary.minPrice === summary.maxPrice
        ? `Цена ${formatPrice(summary.minPrice, currencySymbol)}`
        : `Цены от ${formatPrice(summary.minPrice, currencySymbol)} до ${formatPrice(summary.maxPrice, currencySymbol)}`,
    );
  }
  if (summary.brands.length) {
    lines.push(
      `${summary.brands.length > 1 ? "Бренды" : "Бренд"}: ${summary.brands.slice(0, 8).join(", ")}`,
    );
  }
  return lines;
}
