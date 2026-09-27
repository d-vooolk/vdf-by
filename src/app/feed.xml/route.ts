import { getSite } from "@/lib/catalog";
import { deliveryArea } from "@/lib/delivery";
import { compact, feedOffers, xml } from "@/lib/feed";
import { schemaPrice } from "@/lib/format";
import { absoluteUrl } from "@/lib/seo";

/**
 * Фид для Google Merchant Center — RSS 2.0 с полями g:*.
 *
 * Через него товары попадают в бесплатные карточки Google Покупок: те же
 * данные, что в разметке на странице, но списком и сразу по всему каталогу.
 * Фид добавляется в Merchant Center один раз, дальше Google сам заходит за
 * ним по этому адресу.
 *
 * g:identifier_exists = no — обязательное поле для товаров без штрихкода
 * (GTIN) и заводского номера (MPN). У нас артикул внутренний, так что
 * честный ответ здесь «нет», иначе Google отклоняет предложение.
 *
 * Статический маршрут: пересобирается вместе с каталогом (revalidate.ts).
 */
export const dynamic = "force-static";

export function GET() {
  const site = getSite();
  const offers = feedOffers();

  // Доставка — по каждому способу, который требует адреса. Самовывоз в фиде
  // не доставка: нулевая стоимость по нему выглядела бы как бесплатная
  // доставка куда угодно.
  const methods = site.delivery.methods.filter(
    (method) => method.requiresAddress && deliveryArea(method) === "country",
  );
  const shippingFor = (price: number) =>
    methods
      .map((method) => {
        const free = method.freeFrom != null && price >= method.freeFrom;
        return `
      <g:shipping>
        <g:country>${xml(site.address.country)}</g:country>
        <g:service>${xml(method.name)}</g:service>
        <g:price>${schemaPrice(free ? 0 : method.price)} ${xml(site.currency)}</g:price>
      </g:shipping>`;
      })
      .join("");

  const items = offers
    .map((offer) => {
      const [main, ...rest] = offer.images;
      return `
    <item>
      <g:id>${xml(offer.id)}</g:id>
      <g:title>${xml(offer.title)}</g:title>
      <g:description>${xml(offer.description)}</g:description>
      <g:link>${xml(offer.url)}</g:link>
      ${main ? `<g:image_link>${xml(main)}</g:image_link>` : ""}
      ${rest
        .slice(0, 10)
        .map((url) => `<g:additional_image_link>${xml(url)}</g:additional_image_link>`)
        .join("")}
      <g:availability>${offer.available ? "in_stock" : "out_of_stock"}</g:availability>
      <g:condition>new</g:condition>
      ${
        // g:price — цена без скидки, g:sale_price — со скидкой. Поэтому при
        // наличии старой цены в price уезжает именно она, иначе Google
        // покажет скидку «с 89,90 на 89,90».
        offer.oldPrice
          ? `<g:price>${schemaPrice(offer.oldPrice)} ${xml(site.currency)}</g:price>
      <g:sale_price>${schemaPrice(offer.price)} ${xml(site.currency)}</g:sale_price>`
          : `<g:price>${schemaPrice(offer.price)} ${xml(site.currency)}</g:price>`
      }
      ${offer.brand ? `<g:brand>${xml(offer.brand)}</g:brand>` : ""}
      <g:identifier_exists>no</g:identifier_exists>
      ${offer.groupId ? `<g:item_group_id>${xml(offer.groupId)}</g:item_group_id>` : ""}
      ${
        offer.categoryPath
          ? `<g:product_type>${xml(offer.categoryPath)}</g:product_type>`
          : ""
      }
      ${shippingFor(offer.price)}
    </item>`;
    })
    .join("");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xml(site.name)}</title>
    <link>${xml(absoluteUrl("/"))}</link>
    <description>${xml(site.description)}</description>${items}
  </channel>
</rss>
`;

  return new Response(compact(body), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // Час: чаще, чем раз в час, Merchant Center за фидом всё равно не
      // ходит, а после правки в админке маршрут пересобирается сам.
      "cache-control": "public, max-age=3600",
      "x-robots-tag": "noindex",
    },
  });
}
