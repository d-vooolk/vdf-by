import { formatPrice } from "./format";
import type { Product } from "./schema";
import { firstParagraph } from "./text";
import { priceRange } from "./variant";

export const DESCRIPTION_LIMIT = 165;
export const TITLE_LIMIT = 60;

const MIN_LEAD = 80;

export function leadSentences(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;

  const parts = clean.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [clean];
  let lead = "";
  for (const part of parts) {
    const next = `${lead} ${part.trim()}`.trim();
    if (next.length > limit) break;
    lead = next;
  }
  if (lead) return lead;

  const cut = clean.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return cut
    .slice(0, space > limit / 2 ? space : limit)
    .replace(/[\s,;:—–-]+$/, "");
}

function joinSentences(parts: string[]): string {
  const text = parts
    .map((part) => part.trim().replace(/[.\s]+$/, ""))
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(". ");
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export interface ProductSnippetInput {
  product: Product;
  categoryName?: string;
  currencySymbol: string;
}

export interface ProductSnippet {
  title: string;
  description: string;
  generatedTitle: string;
  generatedDescription: string;
}

export function productSnippet({
  product,
  categoryName,
  currencySymbol,
}: ProductSnippetInput): ProductSnippet {
  const range = priceRange(product);
  const price = formatPrice(range.min, currencySymbol);
  const priceLabel = range.varies ? `от ${price}` : price;

  const titleWithPrice = `${product.title} — ${priceLabel}`;
  const generatedTitle =
    titleWithPrice.length <= TITLE_LIMIT ? titleWithPrice : product.title;

  const lead = firstParagraph(product.description) || product.title;
  const tails = [
    [
      priceLabel,
      ...(categoryName ? [`${categoryName} с доставкой по Минску и Беларуси`] : []),
      "Оплата при получении",
    ],
    [priceLabel, "Доставка по Минску и Беларуси"],
    [priceLabel],
  ];
  const tail =
    tails.find(
      (candidate) =>
        DESCRIPTION_LIMIT - joinSentences(candidate).length - 2 >= MIN_LEAD,
    ) ?? [];
  const room = DESCRIPTION_LIMIT - (tail.length ? joinSentences(tail).length + 2 : 0);
  const generatedDescription = joinSentences([leadSentences(lead, room), ...tail]);

  return {
    title: product.seoTitle?.trim() || generatedTitle,
    description: product.seoDescription?.trim() || generatedDescription,
    generatedTitle,
    generatedDescription,
  };
}
