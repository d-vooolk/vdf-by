import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CatalogControls, type CatalogItem } from "@/components/CatalogControls";
import { CategoryGrid } from "@/components/CategoryTile";
import { JsonLd } from "@/components/JsonLd";
import { ProductCard } from "@/components/ProductCard";
import {
  getCategories,
  getProducts,
  getRootCategories,
  getSite,
} from "@/lib/catalog";
import { pluralize } from "@/lib/format";
import { buildMetadata, itemListJsonLd } from "@/lib/seo";
import { hasAnyInStock, priceRange } from "@/lib/variant";

export function generateMetadata(): Metadata {
  const site = getSite();
  const products = getProducts();
  return buildMetadata({
    title: `Каталог автосвета — ${pluralize(products.length, "товар", "товара", "товаров")} в наличии`,
    description: `Полный каталог ${site.name}: линзы, стёкла фар, лампы, блоки розжига и аксессуары. Доставка по Минску и Беларуси, оплата при получении.`,
    path: "/catalog/",
  });
}

export default function CatalogPage() {
  const site = getSite();
  const categories = getRootCategories();
  // Плитка показывает все разделы, включая вложенные: с этой страницы должен
  // быть виден весь каталог, иначе до подраздела приходится идти через
  // родителя — и покупателю, и краулеру.
  const allCategories = getCategories();
  const products = getProducts();

  const items: CatalogItem[] = products.map((product, position) => ({
    id: product.id,
    brand: product.brand ?? "",
    price: priceRange(product).min,
    inStock: hasAnyInStock(product),
    order: position,
  }));

  return (
    <div className="container-page">
      <Breadcrumbs items={[{ label: "Каталог" }]} />
      <JsonLd data={itemListJsonLd(products, "/catalog/")} />

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

      <CatalogControls
        items={items}
        titles={products.map((product) => product.title)}
      >
        {products.map((product, position) => (
          <ProductCard
            key={product.id}
            product={product}
            currencySymbol={site.currencySymbol}
            priority={position < 3}
          />
        ))}
      </CatalogControls>
    </div>
  );
}
