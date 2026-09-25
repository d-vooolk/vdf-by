import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CategoryGrid } from "@/components/CategoryTile";
import { JsonLd } from "@/components/JsonLd";
import { ProductListing } from "@/components/ProductListing";
import {
  getCategories,
  getProducts,
  getRootCategories,
  getSite,
} from "@/lib/catalog";
import { pluralize } from "@/lib/format";
import {
  clampPage,
  listingHref,
  listingPage,
  readListing,
  type ListingParams,
} from "@/lib/listing";
import { buildMetadata, itemListJsonLd } from "@/lib/seo";

interface PageProps {
  searchParams: Promise<ListingParams>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const site = getSite();
  const products = getProducts();
  const page = clampPage(products.length, readListing(await searchParams).page);
  return buildMetadata({
    title: `Каталог автосвета — ${pluralize(products.length, "товар", "товара", "товаров")} в наличии${page > 1 ? ` — страница ${page}` : ""}`,
    description: `Полный каталог ${site.name}: линзы, стёкла фар, лампы, блоки розжига и аксессуары. Доставка по Минску и Беларуси, оплата при получении.`,
    path: listingHref("/catalog/", page, "default"),
  });
}

export default async function CatalogPage({ searchParams }: PageProps) {
  const listing = readListing(await searchParams);
  const site = getSite();
  const categories = getRootCategories();
  // Плитка показывает все разделы, включая вложенные: с этой страницы должен
  // быть виден весь каталог, иначе до подраздела приходится идти через
  // родителя — и покупателю, и краулеру.
  const allCategories = getCategories();
  const products = getProducts();

  const shown = listingPage(products, listing);

  return (
    <div className="container-page">
      <Breadcrumbs items={[{ label: "Каталог" }]} />
      <JsonLd data={itemListJsonLd(shown.items, "/catalog/")} />

      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">
          Каталог автосвета
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
        <CategoryGrid categories={allCategories} priorityCount={4} />
      </nav>

      <ProductListing
        {...shown}
        sort={listing.sort}
        basePath="/catalog/"
        currencySymbol={site.currencySymbol}
      />
    </div>
  );
}
