import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { MarkChips } from "@/components/CarTiles";
import { CategoryGrid } from "@/components/CategoryTile";
import { Faq } from "@/components/Faq";
import { JsonLd } from "@/components/JsonLd";
import { ListingFacts } from "@/components/ListingFacts";
import { RelatedArticles } from "@/components/RelatedArticles";
import { articlesForCategory } from "@/lib/articles";
import { ProductListing } from "@/components/ProductListing";
import { carsRoot } from "@/lib/car-types";
import { getCarTree } from "@/lib/cars";
import {
  categoryTrail,
  categoryUrl,
  getChildCategories,
  getProductsInCategory,
  getSite,
} from "@/lib/catalog";
import { formatPrice, pluralize } from "@/lib/format";
import {
  clampPage,
  listingHref,
  listingPage,
  pageSuffix,
  PER_PAGE,
  type ListingState,
} from "@/lib/listing";
import type { Category } from "@/lib/schema";
import { buildMetadata, itemListJsonLd, sentences } from "@/lib/seo";
import { cheapestPrice, hasAnyInStock } from "@/lib/variant";

/**
 * Страница раздела — одна на оба адреса.
 *
 * Раздел верхнего уровня живёт по /catalog/lampy/, подраздел — по
 * /catalog/aksessuary/maski/. Это разные роуты, но страница у них одна и та
 * же, и расходиться им незачем: разойдясь, они разойдутся молча, и заметит
 * это не разработчик, а поисковик.
 *
 * У раздела с подразделами над сеткой появляется плитка подразделов, а в
 * самой сетке лежат товары всех его подразделов сразу. Раньше такая
 * страница показывала только плитку: своих товаров у родителя нет (store.ts
 * не даёт их туда положить), и «Аксессуары» открывались двумя ссылками
 * вместо витрины. Товар при этом виден на двух страницах — в подразделе и у
 * родителя, — но канонический адрес у него один, и он не здесь, а на
 * /product/…, так что склейки в поиске это не создаёт.
 */

function stockLine(
  total: number,
  available: number,
  cheapest: number,
  currencySymbol: string,
): string {
  const count = pluralize(total, "позиция", "позиции", "позиций");
  const stock =
    available === total ? " в наличии" : available > 0 ? `, ${available} в наличии` : "";
  const price = cheapest ? `, цены от ${formatPrice(cheapest, currencySymbol)}` : "";
  return `${count}${stock}${price}`;
}

export function categoryMetadata(category: Category, listing: ListingState): Metadata {
  const site = getSite();
  const products = getProductsInCategory(category.id);
  const children = getChildCategories(category.id);
  const marks = category.carFitment ? getCarTree(category.id) : [];
  const cheapest = cheapestPrice(products);
  const available = products.filter(hasAnyInStock).length;
  const page = clampPage(products.length, listing.page);

  const description =
    category.seoDescription ??
    sentences(
      category.excerpt ?? category.name,
      children.length > 0 &&
        `Разделы: ${children.map((child) => child.name).join(", ")}`,
      marks.length > 0 &&
        `Подбор по автомобилю: ${marks
          .slice(0, 8)
          .map((mark) => mark.name)
          .join(", ")}`,
      products.length > 0 && stockLine(products.length, available, cheapest, site.currencySymbol),
      "Доставка по Минску и Беларуси, оплата при получении",
    );

  return buildMetadata({
    title: `${category.seoTitle ?? `${category.name} купить в Минске`}${pageSuffix(page)}`,
    description: page > 1 ? sentences(`${category.name}, страница ${page}`, description) : description,
    path: listingHref(categoryUrl(category), page, "default"),
    image: category.image ?? products.find((product) => product.images[0])?.images[0],
  });
}

export function CategoryView({
  category,
  listing,
}: {
  category: Category;
  listing: ListingState;
}) {
  const site = getSite();
  const url = categoryUrl(category);
  const children = getChildCategories(category.id);

  // Товары подразделов входят в выдачу родителя: у самого родителя их нет,
  // и без них его страница была бы пустой в разметке ItemList.
  const products = getProductsInCategory(category.id);
  const marks = category.carFitment ? getCarTree(category.id) : [];
  const shown = listingPage(products, listing);

  return (
    <div className="container-page">
      <Breadcrumbs
        items={[
          { label: "Каталог", href: "/catalog/" },
          // Для подраздела в крошки попадает и родитель — иначе с него
          // некуда вернуться на уровень выше.
          ...categoryTrail(category).map((entry, index, trail) => ({
            label: entry.name,
            href: index < trail.length - 1 ? categoryUrl(entry) : undefined,
          })),
        ]}
      />
      <JsonLd
        data={itemListJsonLd(
          shown.items,
          listingHref(url, shown.page, "default"),
          (shown.page - 1) * PER_PAGE,
        )}
      />

      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">
          {category.name}
          {shown.page > 1 ? `: страница ${shown.page}` : ""}
        </h1>
      </header>

      {children.length > 0 && (
        <nav
          className="mb-10"
          aria-label={`Подразделы раздела «${category.name}»`}
        >
          <CategoryGrid categories={children} priorityCount={shown.page === 1 ? 2 : 0} />
        </nav>
      )}

      {marks.length > 0 && (
        <nav
          className="mb-10"
          aria-label={`Подбор ${category.name.toLowerCase()} по автомобилю`}
        >
          <h2 className="mb-3 text-lg font-semibold text-brand-900">
            Подбор по автомобилю
          </h2>
          <p className="mb-4 max-w-2xl text-sm text-brand-500">
            Выберите марку — дальше модель и поколение. В подборе останется
            только то, что встаёт на вашу машину без доработок.
          </p>
          <MarkChips
            marks={marks}
            base={carsRoot(category.slug)}
          />
        </nav>
      )}

      {products.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-base font-semibold text-brand-900">
            В этом разделе пока нет товаров
          </p>
          <p className="mt-1.5 text-sm text-brand-500">
            Позвоните — скажем, что есть в наличии под заказ.
          </p>
        </div>
      ) : (
        <ProductListing
          {...shown}
          sort={listing.sort}
          basePath={url}
          currencySymbol={site.currencySymbol}
        />
      )}

      {/* Текст под сеткой, а не над ней: пользователю нужны товары сразу,
          а поисковику всё равно, где на странице лежит описание раздела.
          Короткое описание тоже здесь, первым абзацем — раньше оно стояло под
          заголовком и отодвигало вниз плитку подразделов и сами товары.
          В описание страницы для поиска оно идёт из categoryMetadata, так что
          на выдачу перенос не влияет. */}
      {shown.page === 1 && (category.excerpt || category.description) && (
        <section className="prose-shop mt-14 max-w-3xl border-t border-brand-100 pt-10">
          <h2 className="mb-3 text-xl font-semibold text-brand-900">
            О разделе «{category.name}»
          </h2>
          {category.excerpt && (
            <p className="text-base text-brand-900">{category.excerpt}</p>
          )}
          {category.description?.split("\n\n").map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </section>
      )}

      {shown.page === 1 && (
        <ListingFacts
          title={`${category.name}: коротко о разделе`}
          products={products}
          currencySymbol={site.currencySymbol}
        />
      )}

      {shown.page === 1 && <Faq items={category.faq ?? []} schema />}

      {shown.page === 1 && (
        <RelatedArticles
          articles={articlesForCategory(
            categoryUrl(category),
            new Set(products.map((product) => product.slug)),
          )}
        />
      )}
    </div>
  );
}
