import { carName, years, type ProductCar } from "./car-types";
import { formatPrice, plural, pluralize } from "./format";
import { summarize } from "./listing-summary";
import type { DeliveryMethod, Product } from "./schema";
import { hasAnyInStock, hasPrice, priceRange, resolveVariant } from "./variant";

const THIS_YEAR = new Date().getFullYear();
const MAX_CARS = 6;
const MAX_PRICED_OPTIONS = 4;

function lowerFirst(text: string): string {
  return /^[А-ЯЁ][а-яё]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function endSentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

function daysText(method: DeliveryMethod): string {
  const { daysMin, daysMax } = method;
  if (!daysMax) return "";
  const span = daysMin !== undefined && daysMin !== daysMax ? `${daysMin}–${daysMax}` : String(daysMax);
  return `, ${span} ${plural(daysMax, "рабочий день", "рабочих дня", "рабочих дней")}`;
}

export function deliverySentence(
  methods: DeliveryMethod[],
  currencySymbol: string,
  countryPrice?: number | null,
): string {
  const parts: string[] = [];
  const pickup = methods.find((method) => !method.requiresAddress);
  if (pickup) {
    parts.push(pickup.price ? `самовывоз в Минске — ${formatPrice(pickup.price, currencySymbol)}` : "самовывоз в Минске бесплатно");
  }
  const city = methods.find((method) => method.requiresAddress && method.area !== "country");
  if (city) parts.push(`${lowerFirst(city.name)} — ${formatPrice(city.price, currencySymbol)}`);
  const country = methods.find((method) => method.area === "country");
  if (country) {
    const price = countryPrice ?? country.price;
    const exact = countryPrice !== undefined && countryPrice !== null;
    parts.push(`по Беларуси — ${exact ? "" : "от "}${formatPrice(price, currencySymbol)}${daysText(country)}`);
  }
  if (!parts.length) return "";
  const text = parts.join(", ");
  return endSentence(`${text.charAt(0).toUpperCase()}${text.slice(1)}`);
}

function carLabel(car: ProductCar): string {
  const period = years(car, THIS_YEAR);
  const name = carName({ name: car.markName }, { name: car.modelName }, { name: car.generationName });
  return period ? `${name} (${period})` : name;
}

function fitSentence(cars: ProductCar[]): string {
  if (!cars.length) return "";
  const shown = cars.slice(0, MAX_CARS).map(carLabel).join(", ");
  const rest = cars.length - MAX_CARS;
  return rest > 0
    ? `Подходит к ${shown} и ещё ${pluralize(rest, "поколению", "поколениям", "поколениям")} — список ниже.`
    : `Подходит к ${shown}.`;
}

function optionPriceSentence(product: Product, currencySymbol: string): string {
  if (product.optionGroups.length !== 1) return "";
  const [group] = product.optionGroups;
  if (group.values.length < 2 || group.values.length > MAX_PRICED_OPTIONS) return "";
  const parts: string[] = [];
  for (const value of group.values) {
    const variant = resolveVariant(product, { [group.id]: value.id });
    if (!hasPrice(variant.price)) return "";
    parts.push(
      `${lowerFirst(value.label)} — ${formatPrice(variant.price, currencySymbol)}${variant.inStock ? "" : " (под заказ)"}`,
    );
  }
  return endSentence(`Цена: ${parts.join(", ")}`);
}

function priceSentence(product: Product, currencySymbol: string): string {
  const byOption = optionPriceSentence(product, currencySymbol);
  const stock = hasAnyInStock(product) ? "В наличии в Минске." : "Сейчас под заказ — срок уточним по телефону.";
  if (byOption) return `${byOption} ${stock}`;
  const range = priceRange(product);
  if (!hasPrice(range.min)) return stock;
  return `${endSentence(`Цена — ${range.varies ? "от " : ""}${formatPrice(range.min, currencySymbol)}`)} ${stock}`;
}

function specValue(product: Product, pattern: RegExp): string | undefined {
  return product.specs.find((spec) => pattern.test(spec.name))?.value;
}

export function productAnswer({
  product,
  cars,
  currencySymbol,
  delivery,
}: {
  product: Product;
  cars: ProductCar[];
  currencySymbol: string;
  delivery: string;
}): string {
  const kit = specValue(product, /^комплект/i);
  const warranty = specValue(product, /^гарантия$/i);
  return [
    fitSentence(cars),
    kit ? endSentence(`В комплекте: ${lowerFirst(kit)}`) : "",
    priceSentence(product, currencySymbol),
    delivery,
    warranty ? endSentence(`Гарантия — ${warranty}`) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function listingAnswer(products: Product[], currencySymbol: string): string {
  if (!products.length) return "";
  const summary = summarize(products);
  const count = pluralize(summary.total, "позиция", "позиции", "позиций");
  const stock =
    summary.available === summary.total
      ? "все в наличии в Минске"
      : summary.available > 0
        ? `${summary.available} в наличии в Минске`
        : "сейчас под заказ";
  const price = !summary.minPrice
    ? ""
    : summary.minPrice === summary.maxPrice
      ? `, цена ${formatPrice(summary.minPrice, currencySymbol)}`
      : `, цены от ${formatPrice(summary.minPrice, currencySymbol)} до ${formatPrice(summary.maxPrice, currencySymbol)}`;
  return endSentence(`${count}, ${stock}${price}`);
}
