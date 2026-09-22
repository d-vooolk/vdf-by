import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { GenerationGrid } from "@/components/CarTiles";
import { CatalogControls, type CatalogItem } from "@/components/CatalogControls";
import { JsonLd } from "@/components/JsonLd";
import { ProductCard } from "@/components/ProductCard";
import { carName, markUrl, modelUrl } from "@/lib/car-types";
import {
  findMark,
  findModel,
  getCarTree,
  getProductsForModel,
} from "@/lib/cars";
import { getSite } from "@/lib/catalog";
import { formatPrice, pluralize } from "@/lib/format";
import { buildMetadata, itemListJsonLd, sentences } from "@/lib/seo";
import { hasAnyInStock, priceRange } from "@/lib/variant";

/**
 * Автосвет для одной модели: поколения с фотографиями и весь ассортимент,
 * который к модели подходит.
 *
 * Фотографии поколений здесь не украшение. Владелец машины редко помнит,
 * что у него «VI (F3x) Рестайлинг», зато свою фару узнаёт с первого
 * взгляда — по картинке выбор делается за секунду, по римским цифрам не
 * делается вообще.
 */

export function generateStaticParams() {
  return getCarTree().flatMap((mark) =>
    mark.models.map((model) => ({ mark: mark.slug, model: model.slug })),
  );
}

interface PageProps {
  params: Promise<{ mark: string; model: string }>;
}

function resolve(markSlug: string, modelSlug: string) {
  const mark = findMark(markSlug);
  const model = mark ? findModel(mark, modelSlug) : undefined;
  return mark && model ? { mark, model } : null;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { mark: markSlug, model: modelSlug } = await params;
  const found = resolve(markSlug, modelSlug);
  if (!found) return {};

  const { mark, model } = found;
  const site = getSite();
  const products = getProductsForModel(model.id);
  const cheapest = products.length
    ? Math.min(...products.map((product) => priceRange(product).min))
    : 0;

  const title = carName(mark, model);

  return buildMetadata({
    title: `Автосвет для ${title} — линзы, стёкла фар, лампы`,
    description: sentences(
      `Линзы, стёкла фар и лампы для ${title}`,
      model.generations.length > 0 &&
        `${pluralize(model.generations.length, "поколение", "поколения", "поколений")} в подборе`,
      products.length > 0 &&
        `${pluralize(products.length, "позиция", "позиции", "позиций")}, цены от ${formatPrice(cheapest, site.currencySymbol)}`,
      "Доставка по Минску и Беларуси",
    ),
    path: modelUrl(mark.slug, model.slug),
  });
}

export default async function ModelPage({ params }: PageProps) {
  const { mark: markSlug, model: modelSlug } = await params;
  const found = resolve(markSlug, modelSlug);
  if (!found) notFound();

  const { mark, model } = found;
  const site = getSite();
  const products = getProductsForModel(model.id);
  const currentYear = new Date().getFullYear();
  const title = carName(mark, model);

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
          { label: mark.name, href: markUrl(mark.slug) },
          { label: model.name },
        ]}
      />
      <JsonLd data={itemListJsonLd(products, modelUrl(mark.slug, model.slug))} />

      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">
          Автосвет для {title}
        </h1>
        <p className="mt-2.5 max-w-2xl text-base text-brand-500">
          Выберите поколение — у рестайлинга стёкла и линзы свои, и деталь от
          соседнего года не встанет.
        </p>
      </header>

      <nav className="mb-12" aria-label={`Поколения ${title}`}>
        <h2 className="mb-4 text-lg font-semibold text-brand-900">Поколения</h2>
        <GenerationGrid
          mark={mark}
          model={model}
          currentYear={currentYear}
          priorityCount={4}
        />
      </nav>

      {products.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-brand-900">
            Всё, что подходит к {title}
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
