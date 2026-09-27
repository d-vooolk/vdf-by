import type { CarCategoryGroup } from "./cars";
import { formatPrice, pluralize } from "./format";
import { summarize } from "./listing-summary";
import type { FaqItem, Product } from "./schema";

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} и ${words[words.length - 1]}`;
}

export function categoryPhrase(groups: CarCategoryGroup[]): string {
  const names = groups.map((group) => group.category.name);
  if (!names.length || names.length > 3) return "Автосвет";
  const [first, ...rest] = names;
  return joinWords([first, ...rest.map(lowerFirst)]);
}

export function categoryList(groups: CarCategoryGroup[]): string {
  return joinWords(groups.map((group, index) => (index ? lowerFirst(group.category.name) : group.category.name)));
}

interface CarFaqInput {
  what: string;
  car: string;
  period?: string;
  products: Product[];
  currencySymbol: string;
  phone: string;
}

export function carFaq({ what, car, period, products, currencySymbol, phone }: CarFaqInput): FaqItem[] {
  if (!products.length) return [];

  const summary = summarize(products);
  const subject = lowerFirst(what);
  const titles = products.slice(0, 3).map((product) => product.title);
  const more = products.length > titles.length ? ` и ещё ${products.length - titles.length}` : "";
  const price = summary.minPrice
    ? summary.minPrice === summary.maxPrice
      ? ` Цена — ${formatPrice(summary.minPrice, currencySymbol)}.`
      : ` Цены от ${formatPrice(summary.minPrice, currencySymbol)} до ${formatPrice(summary.maxPrice, currencySymbol)}.`
    : "";

  const items: FaqItem[] = [
    {
      q: `Какие ${subject} подходят к ${car}${period ? ` (${period})` : ""}?`,
      a: `В каталоге ${pluralize(products.length, "позиция", "позиции", "позиций")} под эту машину: ${titles.join("; ")}${more}.${price}`,
    },
    {
      q: `Есть ли ${subject} для ${car} в наличии?`,
      a:
        summary.available === summary.total
          ? `Да, все ${pluralize(summary.total, "позиция", "позиции", "позиций")} есть в наличии, отправляем в день заказа.`
          : summary.available > 0
            ? `В наличии ${summary.available} из ${summary.total}. Остальные позиции закончились — позвоните по номеру ${phone}, скажем, когда появятся.`
            : `Сейчас всё закончилось. Позвоните по номеру ${phone} — скажем, когда появится, или подберём замену.`,
    },
    {
      q: `Как проверить, что ${subject} встанут именно на мой ${car}?`,
      a: `Подбор идёт по поколению${period ? ` — ${period}` : ""}, у рестайлинга посадочные места могут отличаться. Если сомневаетесь, позвоните по номеру ${phone} или пришлите VIN и фото фары — проверим до заказа.`,
    },
  ];

  if (summary.brands.length > 1) {
    items.push({
      q: `Каких производителей ${subject} для ${car} можно купить?`,
      a: `В подборе ${joinWords(summary.brands.slice(0, 6))}. Разница — в материале, оптике и цене; подскажем, что выбрать под вашу задачу.`,
    });
  }

  return items;
}
