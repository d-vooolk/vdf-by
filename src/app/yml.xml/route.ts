import { getSite } from "@/lib/catalog";
import { compact, feedCategories, feedOffers, xml } from "@/lib/feed";
import { schemaPrice } from "@/lib/format";
import { absoluteUrl } from "@/lib/seo";

/**
 * Фид в формате YML — «Яндекс. Язык разметки товаров».
 *
 * Его просят Яндекс, а в Беларуси ещё и Onliner с Kufar: площадки, откуда
 * идёт живой трафик на автозапчасти. Формат старый и придирчивый, поэтому
 * пара оговорок:
 *
 *   — номера разделов обязаны быть числами, а у нас id — это slug'и;
 *     сквозная нумерация делается в feedCategories();
 *   — цена только числом, без символа валюты, валюта отдельным полем;
 *   — вариант товара привязывается к товару атрибутом group_id, и он тоже
 *     обязан быть числом, поэтому группам даём номера по порядку.
 *
 * Статический маршрут: пересобирается вместе с каталогом (revalidate.ts).
 */
export const dynamic = "force-static";

/** Дата в формате YML: 2026-09-13 14:05. */
function ymlDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

const YML_ID_LIMIT = 20;

function fnv32(text: string, seed: number): string {
  let hash = seed;
  for (const byte of Buffer.from(text)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function ymlOfferId(id: string): string {
  if (/^[a-zA-Z0-9]+$/.test(id) && id.length <= YML_ID_LIMIT) return id;
  return `v${fnv32(id, 0x811c9dc5)}${fnv32(id, 0x050c5d1f)}`.slice(0, YML_ID_LIMIT);
}

export function GET() {
  const site = getSite();
  const offers = feedOffers();
  const categories = feedCategories();

  const categoryNumber = new Map(
    categories.map((category) => [category.id, category.number]),
  );

  // Номера групп: YML требует число и в group_id.
  const groupNumbers = new Map<string, number>();
  for (const offer of offers) {
    if (offer.groupId && !groupNumbers.has(offer.groupId)) {
      groupNumbers.set(offer.groupId, groupNumbers.size + 1);
    }
  }

  const pickup = site.delivery.methods.some((method) => !method.requiresAddress);
  const delivery = site.delivery.methods.some((method) => method.requiresAddress);

  const categoryXml = categories
    .map(
      (category) =>
        `      <category id="${category.number}"${
          category.parentNumber ? ` parentId="${category.parentNumber}"` : ""
        }>${xml(category.name)}</category>`,
    )
    .join("\n");

  const offerXml = offers
    .map((offer) => {
      const group = offer.groupId ? groupNumbers.get(offer.groupId) : undefined;
      return `      <offer id="${ymlOfferId(offer.id)}"${
        group ? ` group_id="${group}"` : ""
      } available="${offer.available}">
        <name>${xml(offer.title)}</name>
        <url>${xml(offer.url)}</url>
        <price>${schemaPrice(offer.price)}</price>
        ${offer.oldPrice ? `<oldprice>${schemaPrice(offer.oldPrice)}</oldprice>` : ""}
        <currencyId>${xml(site.currency)}</currencyId>
        <categoryId>${categoryNumber.get(offer.categoryId) ?? 1}</categoryId>
        ${offer.images
          .slice(0, 10)
          .map((url) => `<picture>${xml(url)}</picture>`)
          .join("\n        ")}
        ${offer.brand ? `<vendor>${xml(offer.brand)}</vendor>` : ""}
        ${offer.sku ? `<vendorCode>${xml(offer.sku)}</vendorCode>` : ""}
        <delivery>${delivery}</delivery>
        <pickup>${pickup}</pickup>
        ${offer.unit ? `<sales_notes>Цена за ${xml(offer.unit)}</sales_notes>` : ""}
        <description>${xml(offer.description)}</description>
        ${offer.params
          .slice(0, 20)
          .map(
            (param) =>
              `<param name="${xml(param.name)}">${xml(param.value)}</param>`,
          )
          .join("\n        ")}
      </offer>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${ymlDate(new Date())}">
  <shop>
    <name>${xml(site.name)}</name>
    <company>${xml(site.legalName)}</company>
    <url>${xml(absoluteUrl("/"))}</url>
    <currencies>
      <currency id="${xml(site.currency)}" rate="1"/>
    </currencies>
    <categories>
${categoryXml}
    </categories>
    <offers>
${offerXml}
    </offers>
  </shop>
</yml_catalog>
`;

  return new Response(compact(body), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-robots-tag": "noindex",
    },
  });
}
