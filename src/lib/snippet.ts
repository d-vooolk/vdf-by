import { formatPrice } from "./format";
import type { Product } from "./schema";
import { firstParagraph } from "./text";
import { hasPrice, priceRange } from "./variant";

export const DESCRIPTION_LIMIT = 165;
export const TITLE_LIMIT = 65;
export const TITLE_SEPARATOR = " — ";

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
  siteName?: string;
  twinTitle?: boolean;
  sharedLead?: boolean;
}

export interface ProductSnippet {
  title: string;
  fullTitle: string;
  absoluteTitle: boolean;
  description: string;
  generatedTitle: string;
  generatedDescription: string;
}

export function brandSuffix(siteName: string | undefined): string {
  return siteName ? `${TITLE_SEPARATOR}${siteName}` : "";
}

export function productSnippet({
  product,
  categoryName,
  currencySymbol,
  siteName,
  twinTitle = false,
  sharedLead = false,
}: ProductSnippetInput): ProductSnippet {
  const range = priceRange(product);
  const price = formatPrice(range.min, currencySymbol);
  const priceLabel = hasPrice(range.min) ? (range.varies ? `от ${price}` : price) : "";
  const priceTail = priceLabel ? [priceLabel] : [];
  const suffix = brandSuffix(siteName);

  const baseTitle =
    twinTitle && product.sku ? `${product.title}, арт. ${product.sku}` : product.title;
  const titleWithPrice = priceLabel ? `${baseTitle}${TITLE_SEPARATOR}${priceLabel}` : baseTitle;
  const generatedTitle =
    titleWithPrice.length + suffix.length <= TITLE_LIMIT ? titleWithPrice : baseTitle;

  const paragraph = firstParagraph(product.description);
  const lead = !paragraph
    ? product.title
    : sharedLead
      ? `${product.title}. ${paragraph}`
      : paragraph;
  const tails = [
    [
      ...priceTail,
      ...(categoryName ? [`${categoryName} с доставкой по Минску и Беларуси`] : []),
      "Оплата при получении",
    ],
    [...priceTail, "Доставка по Минску и Беларуси"],
    priceTail,
  ];
  const tail =
    tails.find(
      (candidate) =>
        DESCRIPTION_LIMIT - joinSentences(candidate).length - 2 >= MIN_LEAD,
    ) ?? [];
  const room = DESCRIPTION_LIMIT - (tail.length ? joinSentences(tail).length + 2 : 0);
  const generatedDescription = joinSentences([leadSentences(lead, room), ...tail]);

  const title = product.seoTitle?.trim() || generatedTitle;
  const absoluteTitle = title.length + suffix.length > TITLE_LIMIT;

  return {
    title,
    fullTitle: absoluteTitle ? title : `${title}${suffix}`,
    absoluteTitle,
    description: product.seoDescription?.trim() || generatedDescription,
    generatedTitle,
    generatedDescription,
  };
}
