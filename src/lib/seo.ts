import type { Metadata } from "next";

import { articleImagePaths, articlePlainText, articleProductSlugs } from "./article-body";
import { coverOf } from "./article-photos";
import type { Article } from "./articles";
import { getProducts, getSite } from "./catalog";
import { schemaPrice } from "./format";
import type { ImageEntry } from "./image-types";
import { getImage } from "./images";
import type { Category, DeliveryMethod, Product, Site } from "./schema";
import { deliveryArea } from "./delivery";
import { brandSuffix, TITLE_LIMIT } from "./snippet";
import {
  allProductImages,
  allSelections,
  hasAnyInStock,
  hasPrice,
  priceRange,
  resolveVariant,
  variantQuery,
  type Selection,
} from "./variant";

/**
 * SEO-обвязка: метатеги и разметка schema.org.
 *
 * Всё считается на сборке и уезжает в готовый HTML — краулеру не нужно
 * исполнять JavaScript, чтобы увидеть заголовок, описание и цену.
 */

export function absoluteUrl(path: string): string {
  const site = getSite();
  const base = site.url.replace(/\/$/, "");
  return path === "/" ? `${base}/` : `${base}${path}`;
}

/**
 * Склеивает куски описания в одну строку через точку.
 *
 * Нужно потому, что excerpt товара обычно уже заканчивается точкой, а к нему
 * дописывается цена и категория. Без этой функции получается «Комплект из 2
 * штук.. от 84,90 р.. Лампы» — именно в таком виде сниппет и попадёт в
 * выдачу.
 */
export function sentences(...parts: Array<string | false | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part) && String(part).trim() !== "")
    .map((part) => part.trim().replace(/[.\s]+$/, ""))
    .filter(Boolean)
    .join(". ")
    .concat(".");
}

/** Обрезает описание до длины, которую Google не отрежет многоточием. */
export function clampDescription(text: string, limit = 165): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : limit)}…`;
}

/**
 * Ширина готового файла — из его имени: конвейер дописывает размер в конец
 * («h7-1-1200.jpg»). В манифесте лежит размер исходника, а не этого файла,
 * поэтому узнать его иначе нельзя.
 */
function widthOf(url: string): number {
  const match = url.match(/-(\d+)\.(?:jpg|jpeg|png|webp|avif)$/i);
  return match ? Number(match[1]) : 0;
}

/**
 * Ссылка на картинку не мельче 1200 px — для разметки товара и превью в
 * соцсетях: Google хочет от 1200 для товарных карточек, мессенджеры — для
 * большого превью вместо марки.
 *
 * У фотографий, загруженных до перехода на 1200, jpeg-фолбэк шириной 800.
 * Для них берём самый широкий webp: его понимают и Google, и Telegram с
 * Viber, а пережимать старые файлы заново ради разметки незачем.
 */
export function bigImageUrl(
  entry: ImageEntry | null | undefined,
  min = 1200,
): string | null {
  if (!entry) return null;
  if (widthOf(entry.fallback) >= min) return entry.fallback;

  // Самый узкий из подходящих, а не самый широкий: 1600-я версия в разметке
  // и в превью для мессенджера — это лишний мегабайт без пользы.
  const webp = entry.sources.webp ?? [];
  const wide = webp.find((variant) => variant.w >= min);
  // Ни один не дотянул — исходник просто мелкий. Тогда jpeg: его покажет
  // любой мессенджер, а размер всё равно взять негде.
  return wide?.url ?? entry.fallback ?? null;
}

export const DEFAULT_OG_IMAGE = "/brand/og.png";

interface MetaInput {
  title: string;
  description: string;
  path: string;
  /** Путь картинки из ./media для превью в соцсетях. */
  image?: string;
  noIndex?: boolean;
  canonical?: string;
  absoluteTitle?: boolean;
  article?: { publishedTime: string; modifiedTime: string };
}

export function buildMetadata({
  title,
  description,
  path,
  image,
  noIndex = false,
  canonical,
  absoluteTitle = false,
  article,
}: MetaInput): Metadata {
  const site = getSite();
  const url = absoluteUrl(path);
  const entry = getImage(image);
  const big = bigImageUrl(entry);
  const ogImage = absoluteUrl(big ?? DEFAULT_OG_IMAGE);

  return {
    title:
      absoluteTitle || title.length + brandSuffix(site.name).length > TITLE_LIMIT
        ? { absolute: title }
        : title,
    description: clampDescription(description),
    // canonical снимает вопрос дублей: /catalog/lampy/ и /catalog/lampy/?sort=price
    // для краулера станут одной страницей.
    alternates: { canonical: canonical ? absoluteUrl(canonical) : url },
    robots: noIndex
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      ...(article
        ? { type: "article" as const, publishedTime: article.publishedTime, modifiedTime: article.modifiedTime }
        : { type: "website" as const }),
      siteName: site.name,
      locale: site.locale,
      url,
      title,
      description: clampDescription(description),
      // Размер не указываем: он теперь зависит от того, какой файл нашёлся
      // (1200 или 1600), а врать в разметке про 800 хуже, чем промолчать —
      // соцсети всё равно читают размер из самого файла.
      images: [{ url: ogImage }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: clampDescription(description),
      images: [ogImage],
    },
  };
}

/* ------------------------------------------------------------------ */
/* schema.org                                                          */
/* ------------------------------------------------------------------ */

/** Организация и сайт. Ставится один раз, на главной. */
export function organizationJsonLd() {
  const site = getSite();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Store",
        "@id": storeId(),
        name: site.name,
        legalName: site.legalName,
        description: site.description,
        url: absoluteUrl("/"),
        telephone: site.phone,
        email: site.email,
        ...(storePriceRange(site) ? { priceRange: storePriceRange(site) } : {}),
        currenciesAccepted: site.currency,
        paymentAccepted: site.payment.join(", "),
        address: {
          "@type": "PostalAddress",
          streetAddress: site.address.street,
          addressLocality: site.address.city,
          addressRegion: site.address.region,
          postalCode: site.address.postalCode,
          addressCountry: site.address.country,
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: site.geo.lat,
          longitude: site.geo.lng,
        },
        // Логотип — то, что Google показывает в знании о компании и рядом с
        // сайтом в выдаче. Берём иконку приложения: другого изображения
        // магазина в настройках нет.
        logo: absoluteUrl("/icon.png"),
        image: absoluteUrl("/icon.png"),
        openingHours: site.workHoursSchema,
        areaServed: [
          { "@type": "City", name: "Минск" },
          { "@type": "Country", name: "Беларусь" },
        ],
        ...(socialLinks(site).length ? { sameAs: socialLinks(site) } : {}),
      },
      {
        "@type": "WebSite",
        "@id": absoluteUrl("/#website"),
        url: absoluteUrl("/"),
        name: site.name,
        inLanguage: "ru",
        publisher: { "@id": storeId() },
      },
    ],
  };
}

function storeId(): string {
  return absoluteUrl("/#store");
}

function storePriceRange(site: Site): string {
  const prices = getProducts()
    .map((product) => priceRange(product))
    .flatMap((range) => [range.min, range.max])
    .filter(hasPrice);
  if (!prices.length) return "";
  return `${Math.floor(Math.min(...prices))}–${Math.ceil(Math.max(...prices))} ${site.currency}`;
}

/** Профили в соцсетях — только настоящие адреса страниц, не телефоны. */
function socialLinks(site: Site): string[] {
  return [site.telegram, site.instagram].filter(
    (link): link is string => Boolean(link) && link.startsWith("http"),
  );
}

/**
 * Срок доставки для разметки: по нему Google считает дату «получите к …»
 * и показывает её в выдаче рядом с ценой.
 *
 * handlingTime — сколько мы собираем заказ, transitTime — сколько он едет.
 * В настройках срок один, «от и до», и делить его на глаз незачем: Google
 * складывает оба значения.
 */
function deliveryTime(method: DeliveryMethod) {
  if (method.daysMin == null && method.daysMax == null) return undefined;
  const min = method.daysMin ?? method.daysMax ?? 0;
  const max = method.daysMax ?? method.daysMin ?? 0;

  return {
    "@type": "ShippingDeliveryTime",
    handlingTime: {
      "@type": "QuantitativeValue",
      minValue: 0,
      maxValue: 1,
      unitCode: "DAY",
    },
    transitTime: {
      "@type": "QuantitativeValue",
      minValue: Math.min(min, max),
      maxValue: Math.max(min, max),
      unitCode: "DAY",
    },
  };
}

/**
 * Условия доставки — по блоку на каждый способ, который возит по всей
 * стране. Самовывоз и доставка только по городу сюда не попадают: разметка
 * умеет говорить о стране целиком, и минский тариф в ней превратился бы в
 * обещание доставить за ту же цену в любой город Беларуси.
 *
 * Порог бесплатной доставки учитывается по цене предложения: у товара
 * дороже порога стоимость доставки в разметке нулевая, как и в корзине.
 */
function shippingDetails(site: Site, price: number) {
  return site.delivery.methods
    .filter((method) => method.requiresAddress && deliveryArea(method) === "country")
    .map((method) => {
      const time = deliveryTime(method);
      const free = method.freeFrom != null && price >= method.freeFrom;
      return {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: schemaPrice(free ? 0 : method.price),
          currency: site.currency,
        },
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: site.address.country,
        },
        ...(time ? { deliveryTime: time } : {}),
      };
    });
}

/**
 * Условия возврата. Заявляются только если в настройках задано окно
 * возврата, и ровно тем числом дней, которое написано на странице доставки:
 * разметка, расходящаяся с текстом на сайте, — это прямой путь под ручные
 * санкции, а не мелкая неточность.
 */
function returnPolicy(site: Site) {
  if (!site.returnDays) return undefined;
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: site.address.country,
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: site.returnDays,
    returnMethod: "https://schema.org/ReturnInStore",
    // Пересылку обратно оплачивает покупатель — так и написано на странице
    // доставки. Этот вариант, в отличие от ReturnShippingFees, не требует
    // называть точную сумму, которой у магазина и нет.
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
  };
}

/**
 * До какого числа цена действительна.
 *
 * Конец следующего года, а не «сегодня плюс месяц»: страницы собираются
 * заранее и лежат в кеше, поэтому дата обязана оставаться в будущем и
 * тогда, когда страницу не пересобирали полгода. Просроченная
 * priceValidUntil убирает товар из товарных карточек в выдаче.
 */
function priceValidUntil(): string {
  return `${new Date().getFullYear() + 1}-12-31`;
}

/**
 * Адрес варианта: /product/hella-3r-g5/?cokol=h7&temperatura=5000k
 *
 * Нужен разметке — у каждого предложения свой адрес — и людям: ссылку на
 * конкретный цоколь можно скинуть в переписке. Параметры читает галерея
 * товара (ProductPurchase), а canonical у страницы остаётся один, без
 * параметров, так что дублей в индексе это не создаёт.
 */
export function variantUrl(product: Product, selection: Selection): string {
  return absoluteUrl(
    `/product/${product.slug}/${variantQuery(product, selection)}`,
  );
}

/**
 * Сколько комбинаций опций расписывать предложениями поимённо.
 *
 * У каждого предложения свои условия доставки и возврата, так что двадцать
 * комбинаций — это уже несколько килобайт разметки на странице. Дальше
 * отдаём диапазон цен (AggregateOffer): в выдаче он выглядит так же, просто
 * без отдельной товарной карточки по каждому варианту.
 */
const VARIANT_OFFER_LIMIT = 20;

/**
 * Одно предложение: цена, наличие, доставка и возврат.
 *
 * Именно Offer, а не AggregateOffer, даёт право на товарную карточку в
 * выдаче (с ценой, наличием и сроком доставки) — Google требует, чтобы
 * продавец был назван, а у AggregateOffer его нет.
 */
function offerJsonLd(
  site: Site,
  params: {
    price: number;
    inStock: boolean;
    url: string;
    sku?: string | null;
    name?: string;
  },
) {
  const shipping = shippingDetails(site, params.price);
  const returns = returnPolicy(site);

  return {
    "@type": "Offer",
    ...(params.name ? { name: params.name } : {}),
    ...(params.sku ? { sku: params.sku } : {}),
    price: schemaPrice(params.price),
    priceCurrency: site.currency,
    priceValidUntil: priceValidUntil(),
    availability: params.inStock
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    url: params.url,
    seller: { "@id": storeId() },
    ...(shipping.length ? { shippingDetails: shipping } : {}),
    ...(returns ? { hasMerchantReturnPolicy: returns } : {}),
  };
}

function ownVariantSku(product: Product, selection: Selection): string | null {
  const values = product.optionGroups.map(
    (group) => group.values.find((value) => value.id === selection[group.id]) ?? group.values[0],
  );
  return values.find((value) => value.sku)?.sku ?? null;
}

/**
 * Разметка товара. У товара с опциями каждая комбинация отдаётся своим
 * предложением со своей ценой, артикулом и адресом — иначе Google покажет в
 * выдаче цену одного цоколя, и клиент придёт на страницу с другой ценой.
 */
export function productJsonLd(product: Product, category?: Category) {
  const site = getSite();
  const range = priceRange(product);
  if (!hasPrice(range.min)) return null;

  const inStock = hasAnyInStock(product);
  const url = absoluteUrl(`/product/${product.slug}/`);

  const images = allProductImages(product)
    .map((path) => bigImageUrl(getImage(path)))
    .filter((image): image is string => Boolean(image))
    .map((image) => absoluteUrl(image));

  // Комбинации опций: по одной на каждое предложение. У товара без опций
  // список пустой — предложение будет одно, по цене товара.
  const combos = product.optionGroups.length ? allSelections(product) : [];

  let offers;
  if (!combos.length) {
    offers = offerJsonLd(site, {
      price: range.min,
      inStock,
      url,
      sku: product.sku,
    });
  } else if (combos.length <= VARIANT_OFFER_LIMIT) {
    offers = combos.flatMap((selection) => {
      const variant = resolveVariant(product, selection);
      if (!hasPrice(variant.price)) return [];
      return offerJsonLd(site, {
        name: `${product.title}, ${variant.label}`,
        price: variant.price,
        inStock: variant.inStock,
        url: variantUrl(product, selection),
        sku: ownVariantSku(product, selection),
      });
    });
  } else {
    // Комбинаций слишком много — отдаём диапазон, без карточки по каждой.
    offers = {
      "@type": "AggregateOffer",
      lowPrice: schemaPrice(range.min),
      highPrice: schemaPrice(range.max),
      offerCount: combos.length,
      priceCurrency: site.currency,
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: { "@id": storeId() },
    };
  }

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    url,
    name: product.title,
    description: clampDescription(
      product.description ?? product.title,
      300,
    ),
    ...(images.length ? { image: images } : {}),
    ...(product.brand
      ? { brand: { "@type": "Brand", name: product.brand } }
      : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(category ? { category: category.name } : {}),
    ...(product.specs.length
      ? {
          additionalProperty: product.specs.map((spec) => ({
            "@type": "PropertyValue",
            name: spec.name,
            value: spec.value,
          })),
        }
      : {}),
    offers,
  };
}

/** Список товаров категории — помогает Google понять структуру раздела. */
export function itemListJsonLd(products: Product[], path: string, offset = 0) {
  const items = products.slice(0, 60);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    url: absoluteUrl(path),
    numberOfItems: items.length,
    itemListElement: items.map((product, index) => ({
      "@type": "ListItem",
      position: offset + index + 1,
      url: absoluteUrl(`/product/${product.slug}/`),
      name: product.title,
    })),
  };
}

export function articleJsonLd(article: Article) {
  const site = getSite();
  const url = absoluteUrl(`/stati/${article.slug}/`);
  const images = [
    ...new Set(
      [coverOf(article), ...articleImagePaths(article.body)]
        .map((path) => bigImageUrl(getImage(path)))
        .filter((image): image is string => Boolean(image)),
    ),
  ]
    .slice(0, 5)
    .map((image) => absoluteUrl(image));
  const published = new Date(article.publishedAt ?? article.createdAt).toISOString();

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    mainEntityOfPage: url,
    url,
    headline: article.title.slice(0, 110),
    description: clampDescription(article.seoDescription || article.excerpt || article.title, 300),
    inLanguage: "ru",
    datePublished: published,
    dateModified: new Date(Math.max(article.updatedAt, Date.parse(published))).toISOString(),
    wordCount: articlePlainText(article.body).split(/\s+/).filter(Boolean).length,
    image: images.length ? images : [absoluteUrl(DEFAULT_OG_IMAGE)],
    author: { "@type": "Organization", name: site.name, url: absoluteUrl("/about/") },
    publisher: {
      "@type": "Organization",
      "@id": storeId(),
      name: site.name,
      logo: { "@type": "ImageObject", url: absoluteUrl("/icon.png") },
    },
    ...(article.keyword ? { keywords: article.keyword } : {}),
    mentions: articleProductSlugs(article.body)
      .filter((slug) => getProducts().some((product) => product.slug === slug))
      .slice(0, 10)
      .map((slug) => ({ "@id": `${absoluteUrl(`/product/${slug}/`)}#product` })),
  };
}
