import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CategoryGrid } from "@/components/CategoryTile";
import { JsonLd } from "@/components/JsonLd";
import { ProductListing } from "@/components/ProductListing";
import {
  getProducts,
  getRootCategories,
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
import { buildMetadata, itemListJsonLd, sentences } from "@/lib/seo";
import { cheapestPrice, hasAnyInStock } from "@/lib/variant";

export const CATALOG_PATH = "/catalog/";

export function catalogMetadata(listing: ListingState): Metadata {
  const site = getSite();
  const products = getProducts();
  const page = clampPage(products.length, listing.page);
  const available = products.filter(hasAnyInStock).length;
  const cheapest = cheapestPrice(products);

  return buildMetadata({
    title: `Каталог автосвета в Минске: линзы, стёкла фар, лампы${pageSuffix(page)}`,
    description: sentences(
      `Каталог ${site.name}: линзы, стёкла фар, лампы, блоки розжига и аксессуары`,
      available > 0 &&
        `${pluralize(available, "позиция", "позиции", "позиций")} в наличии${
          cheapest ? `, цены от ${formatPrice(cheapest, site.currencySymbol)}` : ""
        }`,
      page > 1 && `Страница ${page}`,
      "Доставка по Минску и Беларуси, оплата при получении",
    ),
    path: listingHref(CATALOG_PATH, page, "default"),
  });
}

export function CatalogView({ listing }: { listing: ListingState }) {
  const site = getSite();
  const categories = getRootCategories();
  const products = getProducts();

  const shown = listingPage(products, listing);

  return (
    <div className="container-page">
      <Breadcrumbs items={[{ label: "Каталог" }]} />
      <JsonLd
        data={itemListJsonLd(
          shown.items,
          listingHref(CATALOG_PATH, shown.page, "default"),
          (shown.page - 1) * PER_PAGE,
        )}
      />

      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">
          Каталог автосвета{shown.page > 1 ? `: страница ${shown.page}` : ""}
        </h1>
        <p className="mt-2.5 max-w-2xl text-base text-brand-500">
          {pluralize(products.length, "позиция", "позиции", "позиций")} в{" "}
          {pluralize(categories.length, "разделе", "разделах", "разделах")}.
          Подберём комплект под вашу модель — напишите её в комментарии к заказу.
        </p>
      </header>

      {/* Разделы: и навигация, и перелинковка для краулера. Раньше здесь
          был список названий в рамочках — понять по нему, что за раздел
          «Аксессуары», было нельзя. Теперь те же плитки, что на главной. */}
      <nav className="mb-10" aria-label="Разделы каталога">
        <CategoryGrid categories={categories} priorityCount={shown.page === 1 ? 2 : 0} />
      </nav>

      <ProductListing
        {...shown}
        sort={listing.sort}
        basePath={CATALOG_PATH}
        currencySymbol={site.currencySymbol}
      />
    </div>
  );
}
