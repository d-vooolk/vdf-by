#!/usr/bin/env node
/**
 * Проверка собранного сайта: то, что должно быть в HTML для поиска, там есть.
 *
 * Запускать против работающего сервера:
 *
 *   npm run build && npm start     (в одном окне)
 *   npm run verify                 (в другом)
 *
 * Раньше скрипт читал готовые файлы из out/. Статического экспорта больше
 * нет — страницы отдаёт Node-сервер, поэтому проверяем то же самое, но по
 * HTTP. Это даже честнее: так мы видим ровно тот HTML, который получит
 * краулер, вместе с заголовками и редиректами.
 *
 * Смысл не в красоте отчёта, а в том, чтобы после правки шаблонов одной
 * командой убедиться: метатеги на месте, разметка товара валидная, товары
 * попали в HTML без участия JavaScript, sitemap не пустой.
 */

import { env } from "../src/lib/env.mjs";

const BASE = env("SITE_URL", "http://127.0.0.1:3000").replace(/\/$/, "");

let failures = 0;

function check(label, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Загружает адрес и отдаёт тело. redirect: "error" — намеренно: адреса в
 * проекте канонические, со слешем на конце. Если проверка вдруг поедет по
 * редиректу, мы об этом узнаем, а не будем молча проверять другую страницу.
 */
async function read(url) {
  const response = await fetch(BASE + url, { redirect: "error" });
  if (!response.ok) {
    throw new Error(`${url} ответил ${response.status}`);
  }
  return response.text();
}

/** Сегодняшняя дата как «2026-09-13» — для сравнения с priceValidUntil. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

function head(html) {
  const end = html.indexOf("</head>");
  return end === -1 ? html : html.slice(0, end);
}

function attr(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1] : "";
}

function jsonLd(html) {
  return [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].map((match) => {
    try {
      return JSON.parse(match[1]);
    } catch {
      return { "@type": "БИТЫЙ JSON" };
    }
  });
}

/* --------------------------- Сервер на месте? --------------------------- */

try {
  await fetch(BASE + "/", { redirect: "error" });
} catch {
  console.error(
    `Сайт не отвечает на ${BASE}\n` +
      "Запустите его в соседнем окне: npm run build && npm start\n" +
      "Другой адрес задаётся так: SITE_URL=https://vdf.by npm run verify",
  );
  process.exit(1);
}

/* ------------------------------ Главная ------------------------------ */

console.log("\nГлавная");
{
  const html = await read("/");
  const h = head(html);
  check("есть <title>", /<title>[^<]{10,}<\/title>/.test(h));
  check(
    "есть description",
    attr(h, /name="description" content="([^"]{50,})"/).length > 0,
  );
  check("есть canonical", attr(h, /rel="canonical" href="([^"]+)"/).includes("http"));
  check("ровно один <h1>", (html.match(/<h1/g) ?? []).length === 1);
  const blocks = jsonLd(html);
  check(
    "разметка Store и WebSite",
    blocks.some((block) =>
      (block["@graph"] ?? []).some((node) => node["@type"] === "Store"),
    ),
    `блоков: ${blocks.length}`,
  );
}

/* ----------------------------- Категория ----------------------------- */

console.log("\nКатегория /catalog/lampy/");
{
  const html = await read("/catalog/lampy/");
  const h = head(html);
  const description = attr(h, /name="description" content="([^"]*)"/);
  check("есть description", description.length > 50);
  check("нет двойных точек в description", !/\.\./.test(description), description.slice(0, 90));
  check("есть canonical", attr(h, /rel="canonical" href="([^"]+)"/).length > 0);
  check("ровно один <h1>", (html.match(/<h1/g) ?? []).length === 1);
  // Главное: карточки лежат в HTML, а не собираются скриптом на клиенте.
  const cards = (html.match(/<article/g) ?? []).length;
  check("товары есть в HTML без JS", cards > 0, `карточек: ${cards}`);
  check(
    "разметка ItemList",
    jsonLd(html).some((block) => block["@type"] === "ItemList"),
  );
}

/* ------------------------------- Товар ------------------------------- */

console.log("\nТовар /product/osram-night-breaker-200/");
{
  const html = await read("/product/osram-night-breaker-200/");
  const h = head(html);
  const description = attr(h, /name="description" content="([^"]*)"/);
  check("есть description", description.length > 50);
  check("нет двойных точек в description", !/\.\./.test(description), description.slice(0, 90));
  check("ровно один <h1>", (html.match(/<h1/g) ?? []).length === 1);

  const blocks = jsonLd(html);
  const product = blocks.find((block) => block["@type"] === "Product");
  check("есть разметка Product", Boolean(product));
  // У товара с опциями предложений столько же, сколько комбинаций: у каждой
  // своя цена, свой артикул и свой адрес. Право на товарную карточку в
  // выдаче даёт только Offer — у AggregateOffer нет продавца, и Google такие
  // карточки не показывает.
  const offers = Array.isArray(product?.offers)
    ? product.offers
    : [product?.offers].filter(Boolean);

  check(
    "у Product заполнены offers",
    offers.length > 0 &&
      offers.every((offer) => offer.price || offer.lowPrice),
    `предложений: ${offers.length}`,
  );
  check(
    "у каждого варианта свой адрес",
    new Set(offers.map((offer) => offer.url)).size === offers.length,
    offers[0]?.url ?? "",
  );
  check(
    "в предложениях есть условия доставки",
    offers.every((offer) => offer.shippingDetails?.length > 0),
  );
  check(
    "в предложениях есть условия возврата",
    offers.every(
      (offer) => offer.hasMerchantReturnPolicy?.merchantReturnDays > 0,
    ),
    `дней: ${offers[0]?.hasMerchantReturnPolicy?.merchantReturnDays ?? "нет"}`,
  );
  check(
    "priceValidUntil ещё не истёк",
    offers.every(
      (offer) => !offer.priceValidUntil || offer.priceValidUntil > today(),
    ),
    offers[0]?.priceValidUntil ?? "",
  );

  // Адрес варианта из разметки обязан открывать именно этот вариант —
  // иначе мы шлём людей из выдачи не туда.
  const variantUrl = offers.find((offer) => offer.url?.includes("?"))?.url;
  if (variantUrl) {
    const variant = await read(new URL(variantUrl).pathname + new URL(variantUrl).search);
    check(
      "адрес варианта отдаёт страницу товара",
      variant.includes("<h1"),
      variantUrl.replace(BASE, ""),
    );
  }
  check(
    "есть разметка BreadcrumbList",
    blocks.some((block) => block["@type"] === "BreadcrumbList"),
  );
  check("нет битого JSON-LD", !blocks.some((block) => block["@type"] === "БИТЫЙ JSON"));

  // Цена варианта по умолчанию должна быть в HTML: без этого краулер и
  // пользователь с отключённым JS цены не увидят.
  check("цена варианта по умолчанию в HTML", html.includes("89,90"));
  // Все варианты цоколя тоже: это текст страницы, по нему её и найдут.
  const sockets = ["H4", "H7", "H11", "HB3", "HB4"];
  const missing = sockets.filter((socket) => !html.includes(`>${socket}<`));
  check("все цоколя в HTML", missing.length === 0, missing.join(", ") || "все");
}

/* ---------------------------- Служебное ----------------------------- */

console.log("\nСлужебные файлы");
{
  const sitemap = await read("/sitemap.xml");
  const urls = (sitemap.match(/<url>/g) ?? []).length;
  check("sitemap.xml не пустой", urls > 5, `адресов: ${urls}`);
  check("в sitemap нет корзины", !sitemap.includes("/cart/"));

  // Фотографии в sitemap проверяем только если они вообще есть: на свежей
  // установке манифест пуст, и падать из-за этого нечему.
  const catalog = await read("/catalog/");
  if (/\/img\/[^"]+\.(?:avif|webp|jpg)/.test(catalog)) {
    check("в sitemap перечислены фотографии", sitemap.includes("<image:loc>"));
  }

  const robots = await read("/robots.txt");
  check("robots.txt ссылается на sitemap", robots.includes("sitemap.xml"));
  check("robots.txt закрывает корзину", robots.includes("/cart/"));

  // Товарные фиды: через них каталог попадает в Google Покупки, Яндекс,
  // Onliner и Kufar.
  const feed = await read("/feed.xml");
  const items = (feed.match(/<item>/g) ?? []).length;
  check("feed.xml собран", items > 0, `предложений: ${items}`);
  check("в feed.xml есть цены", feed.includes("<g:price>"));
  check(
    "в feed.xml указано отсутствие штрихкодов",
    feed.includes("<g:identifier_exists>no</g:identifier_exists>"),
  );

  const yml = await read("/yml.xml");
  const ymlOffers = (yml.match(/<offer /g) ?? []).length;
  check("yml.xml собран", ymlOffers > 0, `предложений: ${ymlOffers}`);
  check("в yml.xml номера разделов числовые", /<category id="\d+"/.test(yml));
  check(
    "в yml.xml варианты привязаны к товару",
    !yml.includes("group_id=\"undefined\""),
  );

  const variants = JSON.parse(await read("/variants.json"));
  check(
    "variants.json собран",
    Object.keys(variants).length > 0,
    `вариантов: ${Object.keys(variants).length}`,
  );

  const index = JSON.parse(await read("/search-index.json"));
  check("search-index.json собран", index.length > 0, `товаров: ${index.length}`);
  check(
    "в индексе поиска есть подписи опций",
    index.some((entry) => entry.q.includes("h7")),
  );

  const cart = await read("/cart/");
  check(
    "страница корзины закрыта от индексации",
    /name="robots" content="noindex/.test(head(cart)),
  );
}

/* ---------------------------- Админка ------------------------------- */

// Админка обязана быть закрыта и от людей без куки, и от поисковиков.
console.log("\nАдминка");
{
  const response = await fetch(BASE + "/admin/", { redirect: "manual" });
  check(
    "/admin/ без входа уводит на логин",
    response.status === 307 || response.status === 302,
    `ответ ${response.status}`,
  );
  const robots = await read("/robots.txt");
  check("robots.txt закрывает /admin/", robots.includes("/admin/"));
}

console.log(
  failures === 0
    ? "\nВсё на месте.\n"
    : `\nПроблем: ${failures}. Смотрите отметки ✗ выше.\n`,
);
process.exit(failures === 0 ? 0 : 1);
