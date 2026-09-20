import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CatalogControls, type CatalogItem } from "@/components/CatalogControls";
import { JsonLd } from "@/components/JsonLd";
import { Picture } from "@/components/Picture";
import { ProductCard } from "@/components/ProductCard";
import {
  carName,
  generationUrl,
  markUrl,
  modelUrl,
  years,
} from "@/lib/car-types";
import {
  findGeneration,
  findMark,
  findModel,
  getCarTree,
  getProductsForGeneration,
} from "@/lib/cars";
import { brandsOf, getSite } from "@/lib/catalog";
import { formatPrice, pluralize } from "@/lib/format";
import { getImage } from "@/lib/images";
import { buildMetadata, itemListJsonLd, sentences } from "@/lib/seo";
import { hasAnyInStock, priceRange } from "@/lib/variant";

/**
 * Автосвет для конкретного поколения — то, ради чего весь подбор и сделан.
 *
 * Именно этот адрес отвечает на запрос «стекло фары гольф 7» и ему подобные,
 * поэтому здесь есть всё, что такому запросу нужно: название машины с
 * годами в заголовке, её фотография, товары и ссылки на соседние поколения.
 *
 * Страницы создаются только под существующие привязки (generateStaticParams
 * идёт по дереву живых связей), поэтому пустой эта страница быть не может.
 */

export function generateStaticParams() {
  return getCarTree().flatMap((mark) =>
    mark.models.flatMap((model) =>
      model.generations.map((generation) => ({
        mark: mark.slug,
        model: model.slug,
        generation: generation.slug,
      })),
    ),
  );
}

interface PageProps {
  params: Promise<{ mark: string; model: string; generation: string }>;
}

function resolve(markSlug: string, modelSlug: string, generationSlug: string) {
  const mark = findMark(markSlug);
  const model = mark ? findModel(mark, modelSlug) : undefined;
  const generation = model ? findGeneration(model, generationSlug) : undefined;
  return mark && model && generation ? { mark, model, generation } : null;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { mark: markSlug, model: modelSlug, generation: generationSlug } =
    await params;
  const found = resolve(markSlug, modelSlug, generationSlug);
  if (!found) return {};

  const { mark, model, generation } = found;
  const site = getSite();
  const products = getProductsForGeneration(generation.id);
  const cheapest = products.length
    ? Math.min(...products.map((product) => priceRange(product).min))
    : 0;
  const period = years(generation, new Date().getFullYear());
  const title = carName(mark, model, generation);

  return buildMetadata({
    title: `Автосвет для ${title}${period ? ` (${period})` : ""}`,
    description: sentences(
      `Линзы, стёкла фар и лампы для ${title}${period ? ` ${period}` : ""}`,
      products.length > 0 &&
        `${pluralize(products.length, "позиция", "позиции", "позиций")}, цены от ${formatPrice(cheapest, site.currencySymbol)}`,
      "Проверяем каждый комплект на стенде. Доставка по Минску и Беларуси",
    ),
    path: generationUrl(mark.slug, model.slug, generation.slug),
    image: generation.photo || undefined,
  });
}

export default async function GenerationPage({ params }: PageProps) {
  const { mark: markSlug, model: modelSlug, generation: generationSlug } =
    await params;
  const found = resolve(markSlug, modelSlug, generationSlug);
  if (!found) notFound();

  const { mark, model, generation } = found;
  const site = getSite();
  const products = getProductsForGeneration(generation.id);
  const currentYear = new Date().getFullYear();
  const period = years(generation, currentYear);
  const title = carName(mark, model, generation);

  const siblings = model.generations.filter(
    (item) => item.id !== generation.id,
  );

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
          { label: model.name, href: modelUrl(mark.slug, model.slug) },
          { label: generation.name },
        ]}
      />
      <JsonLd
        data={itemListJsonLd(
          products,
          generationUrl(mark.slug, model.slug, generation.slug),
        )}
      />

      <header className="mb-8 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">
            Автосвет для {title}
          </h1>
          {period && (
            <p className="mt-1.5 text-sm text-brand-400">Годы выпуска: {period}</p>
          )}
          <p className="mt-2.5 max-w-2xl text-base text-brand-500">
            {pluralize(products.length, "позиция", "позиции", "позиций")},
            которые встают на эту машину без доработок. Не уверены в цоколе —
            позвоните, подскажем по VIN.
          </p>
        </div>

        {generation.photo && (
          <div className="w-full max-w-[18rem] justify-self-start sm:justify-self-end">
            <Picture
              entry={getImage(generation.photo)}
              alt={title}
              sizes="(max-width: 640px) 90vw, 288px"
              priority
              className="h-auto w-full object-contain"
            />
          </div>
        )}
      </header>

      <CatalogControls
        items={items}
        titles={products.map((product) => product.title)}
        brands={brandsOf(products)}
        currencySymbol={site.currencySymbol}
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

      {siblings.length > 0 && (
        <nav className="mt-14" aria-label={`Другие поколения ${model.name}`}>
          <h2 className="mb-4 text-lg font-semibold text-brand-900">
            Другие поколения {carName(mark, model)}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {siblings.map((item) => {
              const itemPeriod = years(item, currentYear);
              return (
                <li key={item.id}>
                  <Link
                    href={generationUrl(mark.slug, model.slug, item.slug)}
                    className="card card-link block px-4 py-2.5 text-sm"
                  >
                    <span className="font-semibold text-brand-900">
                      {item.name}
                    </span>
                    {itemPeriod && (
                      <span className="ml-2 text-xs text-brand-400">
                        {itemPeriod}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
