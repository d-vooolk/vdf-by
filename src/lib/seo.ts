import type { Metadata } from "next";

import { getSite } from "./catalog";
import { schemaPrice } from "./format";
import type { ImageEntry } from "./image-types";
import { getImage } from "./images";
import type { Category, DeliveryMethod, Product, Site } from "./schema";
import {
  allProductImages,
  allSelections,
  hasAnyInStock,
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

interface MetaInput {
  title: string;
  description: string;
  path: string;
  /** Путь картинки из ./media для превью в соцсетях. */
  image?: string;
  noIndex?: boolean;
}

export function buildMetadata({
  title,
  description,
  path,
  image,
  noIndex = false,
}: MetaInput): Metadata {
  const site = getSite();
  const url = absoluteUrl(path);
  const entry = getImage(image);
  const big = bigImageUrl(entry);
  const ogImage = big ? absoluteUrl(big) : undefined;

  return {
    title,
    description: clampDescription(description),
    // canonical снимает вопрос дублей: /catalog/lampy/ и /catalog/lampy/?sort=price
    // для краулера станут одной страницей.
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: site.name,
      locale: site.locale,
      url,
      title,
      description: clampDescription(description),
      // Размер не указываем: он теперь зависит от того, какой файл нашёлся
      // (1200 или 1600), а врать в разметке про 800 хуже, чем промолчать —
      // соцсети всё равно читают размер из самого файла.
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description: clampDescription(description),
      ...(ogImage ? { images: [ogImage] } : {}),
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
        "@id": `${site.url}/#store`,
        name: site.name,
        legalName: site.legalName,
        description: site.description,
        url: absoluteUrl("/"),
        telephone: site.phone,
        email: site.email,
        priceRange: "10–1000 BYN",
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
        "@id": `${site.url}/#website`,
        url: absoluteUrl("/"),
        name: site.name,
        inLanguage: "ru",
        publisher: { "@id": `${site.url}/#store` },
      },
    ],
  };
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
 * Условия доставки — по блоку на каждый способ, который требует адреса.
 *
 * Самовывоз сюда не попадает: это не доставка, и нулевую стоимость по нему
 * Google понял бы как бесплатную доставку куда угодно.
 *
 * Порог бесплатной доставки («бесплатно от 150 р.») в разметке не
 * выражается — свойства под него у Google нет, а выдуманное будет просто
 * проигнорировано. На странице доставки порог указан словами.
 */
function shippingDetails(site: Site) {
  return site.delivery.methods
    .filter((method) => method.requiresAddress)
    .map((method) => {
      const time = deliveryTime(method);
      return {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: schemaPrice(method.price),
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
  const shipping = shippingDetails(site);
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
    seller: { "@id": `${site.url}/#store` },
    ...(shipping.length ? { shippingDetails: shipping } : {}),
    ...(returns ? { hasMerchantReturnPolicy: returns } : {}),
  };
}

/**
 * Разметка товара. У товара с опциями каждая комбинация отдаётся своим
 * предложением со своей ценой, артикулом и адресом — иначе Google покажет в
 * выдаче цену одного цоколя, и клиент придёт на страницу с другой ценой.
 */
export function productJsonLd(product: Product, category?: Category) {
  const site = getSite();
  const range = priceRange(product);
  const inStock = hasAnyInStock(product);
  const availability = inStock
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";

  const images = allProductImages(product)
    .map((path) => bigImageUrl(getImage(path)))
    .filter((url): url is string => Boolean(url))
    .map((url) => absoluteUrl(url));

  // Комбинации опций: по одной на каждое предложение. У товара без опций
  // список пустой — предложение будет одно, по цене товара.
  const combos = product.optionGroups.length ? allSelections(product) : [];

  let offers;
  if (!combos.length) {
    offers = offerJsonLd(site, {
      price: range.min,
      inStock,
      url: absoluteUrl(`/product/${product.slug}/`),
      sku: product.sku,
    });
  } else if (combos.length <= VARIANT_OFFER_LIMIT) {
    offers = combos.map((selection) => {
      const variant = resolveVariant(product, selection);
      return offerJsonLd(site, {
        name: `${product.title}, ${variant.label}`,
        price: variant.price,
        inStock: variant.inStock,
        url: variantUrl(product, selection),
        sku: variant.sku,
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
      availability,
      seller: { "@id": `${site.url}/#store` },
    };
  }

  return {
    "@context": "https://schema.org",
    "@type": "Product",
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
export function itemListJsonLd(products: Product[], path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    url: absoluteUrl(path),
    numberOfItems: products.length,
    itemListElement: products.slice(0, 50).map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(`/product/${product.slug}/`),
      name: product.title,
    })),
  };
}
