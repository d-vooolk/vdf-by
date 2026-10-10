import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { MarkChips } from "@/components/CarTiles";
import { CategoryGrid } from "@/components/CategoryTile";
import { Faq } from "@/components/Faq";
import { JsonLd } from "@/components/JsonLd";
import { ListingFacts } from "@/components/ListingFacts";
import { RelatedArticles } from "@/components/RelatedArticles";
import { WorkshopNote } from "@/components/WorkshopNote";
import { articlesForCategory } from "@/lib/articles";
import { ProductListing } from "@/components/ProductListing";
import { carsRoot } from "@/lib/car-types";
import { getCarTree } from "@/lib/cars";
import Link from "next/link";

import {
  categoryCollections,
  categoryTrail,
  categoryUrl,
  collectionUrl,
  getChildCategories,
  getProductsInCategory,
  getProductsInCollection,
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
import type { Category, CategoryCollection } from "@/lib/schema";
import { buildMetadata, itemListJsonLd, sentences } from "@/lib/seo";
import { cheapestPrice, hasAnyInStock } from "@/lib/variant";
import { workshopLinkFor } from "@/lib/workshop-links";

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

export function collectionMetadata(
  category: Category,
  collection: CategoryCollection,
  listing: ListingState,
): Metadata {
  const site = getSite();
  const products = getProductsInCollection(category, collection);
  const page = clampPage(products.length, listing.page);
  const description =
    collection.seoDescription ??
    sentences(
      collection.excerpt ?? collection.name,
      products.length > 0 &&
        stockLine(
          products.length,
          products.filter(hasAnyInStock).length,
          cheapestPrice(products),
          site.currencySymbol,
        ),
      "Доставка по Минску и Беларуси, оплата при получении",
    );
  return buildMetadata({
    title: `${collection.seoTitle ?? `${collection.name} купить в Минске`}${pageSuffix(page)}`,
    description: page > 1 ? sentences(`${collection.name}, страница ${page}`, description) : description,
    path: listingHref(collectionUrl(category, collection), page, "default"),
    image: products.find((product) => product.images[0])?.images[0],
  });
}

function CollectionLinks({ category, current }: { category: Category; current?: CategoryCollection }) {
  const collections = categoryCollections(category);
  if (!collections.length) return null;
  const chip = "rounded-full border px-3.5 py-1.5 text-sm font-medium";
  return (
    <nav className="mb-8 flex flex-wrap gap-2" aria-label={`Подборки раздела «${category.name}»`}>
      <Link
        href={categoryUrl(category)}
        aria-current={current ? undefined : "page"}
        className={`${chip} ${current ? "border-brand-200 text-brand-700 hover:border-brand-400" : "border-brand-800 bg-brand-800 text-white"}`}
      >
        Все
      </Link>
      {collections.map((collection) => (
        <Link
          key={collection.slug}
          href={collectionUrl(category, collection)}
          aria-current={current?.slug === collection.slug ? "page" : undefined}
          className={`${chip} ${
            current?.slug === collection.slug
              ? "border-brand-800 bg-brand-800 text-white"
              : "border-brand-200 text-brand-700 hover:border-brand-400"
          }`}
        >
          {collection.label ?? collection.name}
        </Link>
      ))}
    </nav>
  );
}

export function CategoryView({
  category,
  listing,
  collection,
}: {
  category: Category;
  listing: ListingState;
  collection?: CategoryCollection;
}) {
  const site = getSite();
  const url = collection ? collectionUrl(category, collection) : categoryUrl(category);
  const heading = collection?.name ?? category.name;
  const children = collection ? [] : getChildCategories(category.id);

  // Товары подразделов входят в выдачу родителя: у самого родителя их нет,
  // и без них его страница была бы пустой в разметке ItemList.
  const products = collection ? getProductsInCollection(category, collection) : getProductsInCategory(category.id);
  const marks = category.carFitment && !collection ? getCarTree(category.id) : [];
  const shown = listingPage(products, listing);
  const excerpt = collection ? collection.excerpt : category.excerpt;
  const description = collection ? collection.description : category.description;
  const workshop = workshopLinkFor(category);

  return (
    <div className="container-page">
      <Breadcrumbs
        items={[
          { label: "Каталог", href: "/catalog/" },
          // Для подраздела в крошки попадает и родитель — иначе с него
          // некуда вернуться на уровень выше.
          ...categoryTrail(category).map((entry, index, trail) => ({
            label: entry.name,
            href: index < trail.length - 1 || collection ? categoryUrl(entry) : undefined,
          })),
          ...(collection ? [{ label: collection.name }] : []),
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
          {heading}
          {shown.page > 1 ? `: страница ${shown.page}` : ""}
        </h1>
      </header>

      <CollectionLinks category={category} current={collection} />

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
      {shown.page === 1 && (excerpt || description) && (
        <section className="prose-shop mt-14 max-w-3xl border-t border-brand-100 pt-10">
          <h2 className="mb-3 text-xl font-semibold text-brand-900">
            {collection ? collection.name : `О разделе «${category.name}»`}
          </h2>
          {excerpt && (
            <p className="text-base text-brand-900">{excerpt}</p>
          )}
          {description?.split("\n\n").map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </section>
      )}

      {shown.page === 1 && workshop && <WorkshopNote link={workshop} className="mt-10 max-w-3xl" />}

      {shown.page === 1 && (
        <ListingFacts
          title={collection ? `${heading}: коротко` : `${category.name}: коротко о разделе`}
          products={products}
          currencySymbol={site.currencySymbol}
        />
      )}

      {shown.page === 1 && !collection && <Faq items={category.faq ?? []} schema />}

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
