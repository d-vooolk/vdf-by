import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ModelList } from "@/components/CarTiles";
import { CatalogControls, type CatalogItem } from "@/components/CatalogControls";
import { JsonLd } from "@/components/JsonLd";
import { ProductCard } from "@/components/ProductCard";
import { markUrl } from "@/lib/car-types";
import { findMark, getCarTree, getProductsForMark } from "@/lib/cars";
import { getSite } from "@/lib/catalog";
import { formatPrice, pluralize } from "@/lib/format";
import { buildMetadata, itemListJsonLd, sentences } from "@/lib/seo";
import { hasAnyInStock, priceRange } from "@/lib/variant";

/**
 * Автосвет для одной марки: список моделей и весь ассортимент под неё.
 *
 * Товары здесь есть не для объёма: страница только со ссылками на модели —
 * это страница-оглавление, за которую поисковику не за что зацепиться.
 * Дубля с каталогом при этом не возникает — canonical у каждого товара
 * ведёт на его собственный адрес.
 */

export function generateStaticParams() {
  return getCarTree().map((mark) => ({ mark: mark.slug }));
}

interface PageProps {
  params: Promise<{ mark: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { mark: slug } = await params;
  const mark = findMark(slug);
  if (!mark) return {};

  const site = getSite();
  const products = getProductsForMark(mark.id);
  const cheapest = products.length
    ? Math.min(...products.map((product) => priceRange(product).min))
    : 0;

  return buildMetadata({
    title: `Автосвет для ${mark.name} — линзы, стёкла фар, лампы`,
    description: sentences(
      `Линзы, стёкла фар и лампы для ${mark.name}`,
      `Подбор по модели и поколению: ${mark.models
        .slice(0, 6)
        .map((model) => model.name)
        .join(", ")}`,
      products.length > 0 &&
        `${pluralize(products.length, "позиция", "позиции", "позиций")}, цены от ${formatPrice(cheapest, site.currencySymbol)}`,
      "Доставка по Минску и Беларуси, оплата при получении",
    ),
    path: markUrl(mark.slug),
  });
}

export default async function MarkPage({ params }: PageProps) {
  const { mark: slug } = await params;
  const mark = findMark(slug);
  if (!mark) notFound();

  const site = getSite();
  const products = getProductsForMark(mark.id);

  const items: CatalogItem[] = products.map((product, position) => ({
    id: product.id,
    brand: product.brand ?? "",
    price: priceRange(product).min,
    inStock: hasAnyInStock(product),
    order: position,
  }));

  return (
    <div className="container-page pb-16">
      <Breadcrumbs
        items={[
          { label: "Подбор по автомобилю", href: "/podbor/" },
          { label: mark.name },
        ]}
      />
      <JsonLd data={itemListJsonLd(products, markUrl(mark.slug))} />

      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">
          Автосвет для {mark.name}
        </h1>
        <p className="mt-2.5 max-w-2xl text-base text-brand-500">
          Выберите модель, а затем поколение — подбор идёт до поколения,
          потому что у рестайлинга фары и крепления свои.
        </p>
      </header>

      <nav className="mb-12" aria-label={`Модели ${mark.name}`}>
        <h2 className="mb-4 text-lg font-semibold text-brand-900">Модели</h2>
        <ModelList mark={mark} />
      </nav>

      {products.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-brand-900">
            Всё, что подходит к {mark.name}
          </h2>
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
        </section>
      )}
    </div>
  );
}
