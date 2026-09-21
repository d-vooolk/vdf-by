import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { GenerationList, ModelList } from "@/components/CarTiles";
import { CatalogControls, type CatalogItem } from "@/components/CatalogControls";
import { Faq } from "@/components/Faq";
import { JsonLd } from "@/components/JsonLd";
import { ProductCard } from "@/components/ProductCard";
import {
  categoriesForGeneration,
  categoriesForMark,
  categoriesForModel,
  type GenerationScope,
  type MarkScope,
  type ModelScope,
  type RelatedCategory,
} from "@/lib/car-branch";
import {
  carName,
  carsRoot,
  generationUrl,
  markUrl,
  modelUrl,
  years,
} from "@/lib/car-types";
import {
  getProductsForGeneration,
  getProductsForMark,
  getProductsForModel,
} from "@/lib/cars";
import { brandsOf, categoryUrl, getSite } from "@/lib/catalog";
import { formatPrice, pluralize } from "@/lib/format";
import type { Category, Product } from "@/lib/schema";
import { buildMetadata, itemListJsonLd, sentences } from "@/lib/seo";
import { hasAnyInStock, priceRange } from "@/lib/variant";

const THIS_YEAR = new Date().getFullYear();

function priceFrom(products: Product[]): number {
  return products.length
    ? Math.min(...products.map((product) => priceRange(product).min))
    : 0;
}

function countLine(products: Product[], currencySymbol: string): string | false {
  return (
    products.length > 0 &&
    `${pluralize(products.length, "позиция", "позиции", "позиций")}, цены от ${formatPrice(
      priceFrom(products),
      currencySymbol,
    )}`
  );
}

function catalogItems(products: Product[]): CatalogItem[] {
  return products.map((product, position) => ({
    id: product.id,
    brand: product.brand ?? "",
    price: priceRange(product).min,
    inStock: hasAnyInStock(product),
    order: position,
  }));
}

function ProductGrid({
  products,
  currencySymbol,
}: {
  products: Product[];
  currencySymbol: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {products.map((product, position) => (
        <ProductCard
          key={product.id}
          product={product}
          currencySymbol={currencySymbol}
          priority={position < 3}
        />
      ))}
    </div>
  );
}

function Filtered({
  products,
  currencySymbol,
}: {
  products: Product[];
  currencySymbol: string;
}) {
  return (
    <CatalogControls
      items={catalogItems(products)}
      titles={products.map((product) => product.title)}
      brands={brandsOf(products)}
      currencySymbol={currencySymbol}
    >
      {products.map((product, position) => (
        <ProductCard
          key={product.id}
          product={product}
          currencySymbol={currencySymbol}
          priority={position < 3}
        />
      ))}
    </CatalogControls>
  );
}

function RelatedNav({
  title,
  related,
  allUrl,
  allLabel,
}: {
  title: string;
  related: RelatedCategory[];
  allUrl: string;
  allLabel: string;
}) {
  const heading = related.length ? title : "Смотрите также";

  return (
    <nav className="mt-14 border-t border-brand-100 pt-8" aria-label={heading}>
      <h2 className="mb-4 text-lg font-semibold text-brand-900">{heading}</h2>
      <ul className="flex flex-wrap gap-2">
        {related.map((entry) => (
          <li key={entry.category.id}>
            <Link href={entry.url} className="card card-link block px-4 py-2.5">
              <span className="text-sm font-semibold text-brand-900">
                {entry.category.name}
              </span>
              <span className="ml-2 text-xs text-brand-400">
                {entry.count}
              </span>
            </Link>
          </li>
        ))}
        <li>
          <Link
            href={allUrl}
            className="card card-link block px-4 py-2.5 text-sm font-semibold text-brand-700"
          >
            {allLabel}
          </Link>
        </li>
      </ul>
    </nav>
  );
}

function crumbs(category: Category) {
  return [
    { label: "Каталог", href: "/catalog/" },
    { label: category.name, href: categoryUrl(category) },
  ];
}

export function categoryMarkMetadata({ category, mark }: MarkScope): Metadata {
  const site = getSite();
  const products = getProductsForMark(mark.id, category.id);

  return buildMetadata({
    title: `${category.name} для ${mark.name}`,
    description: sentences(
      `${category.name} для ${mark.name} с подбором по модели и поколению`,
      mark.models.length > 0 &&
        `В подборе: ${mark.models
          .slice(0, 6)
          .map((model) => model.name)
          .join(", ")}`,
      countLine(products, site.currencySymbol),
      "Доставка по Минску и Беларуси, оплата при получении",
    ),
    path: markUrl(mark.slug, carsRoot(category.slug)),
  });
}

export function CategoryMarkView({ category, mark }: MarkScope) {
  const site = getSite();
  const base = carsRoot(category.slug);
  const products = getProductsForMark(mark.id, category.id);
  const related = categoriesForMark(category, mark);

  return (
    <div className="container-page pb-16">
      <Breadcrumbs items={[...crumbs(category), { label: mark.name }]} />
      <JsonLd
        data={itemListJsonLd(products, markUrl(mark.slug, base))}
      />

      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">
          {category.name} для {mark.name}
        </h1>
        <p className="mt-2.5 max-w-2xl text-base text-brand-500">
          Выберите модель, а затем поколение: у рестайлинга посадочные места и
          крепления свои, и деталь от соседнего года не встанет.
        </p>
      </header>

      <nav className="mb-12" aria-label={`Модели ${mark.name}`}>
        <h2 className="mb-4 text-lg font-semibold text-brand-900">Модели</h2>
        <ModelList mark={mark} base={base} />
      </nav>

      {products.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-brand-900">
            {category.name} для {mark.name} — всё, что подходит
          </h2>
          <Filtered products={products} currencySymbol={site.currencySymbol} />
        </section>
      )}

      <RelatedNav
        title={`Что ещё подходит к ${mark.name}`}
        related={related}
        allUrl={markUrl(mark.slug)}
        allLabel={`Весь автосвет для ${mark.name}`}
      />

      <Faq
        items={category.faq ?? []}
        title={`${category.name}: частые вопросы`}
      />
    </div>
  );
}

export function categoryModelMetadata({
  category,
  mark,
  model,
}: ModelScope): Metadata {
  const site = getSite();
  const products = getProductsForModel(model.id, category.id);
  const title = carName(mark, model);

  return buildMetadata({
    title: `${category.name} для ${title}`,
    description: sentences(
      `${category.name} для ${title}`,
      model.generations.length > 0 &&
        `${pluralize(model.generations.length, "поколение", "поколения", "поколений")} в подборе`,
      countLine(products, site.currencySymbol),
      "Доставка по Минску и Беларуси",
    ),
    path: modelUrl(mark.slug, model.slug, carsRoot(category.slug)),
  });
}

export function CategoryModelView({ category, mark, model }: ModelScope) {
  const site = getSite();
  const base = carsRoot(category.slug);
  const products = getProductsForModel(model.id, category.id);
  const related = categoriesForModel(category, mark, model);
  const title = carName(mark, model);

  return (
    <div className="container-page pb-16">
      <Breadcrumbs
        items={[
          ...crumbs(category),
          { label: mark.name, href: markUrl(mark.slug, base) },
          { label: model.name },
        ]}
      />
      <JsonLd
        data={itemListJsonLd(products, modelUrl(mark.slug, model.slug, base))}
      />

      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">
          {category.name} для {title}
        </h1>
        <p className="mt-2.5 max-w-2xl text-base text-brand-500">
          Выберите поколение — свою машину проще узнать по фотографии, чем по
          римским цифрам в названии.
        </p>
      </header>

      <nav className="mb-12" aria-label={`Поколения ${title}`}>
        <h2 className="mb-4 text-lg font-semibold text-brand-900">Поколения</h2>
        <GenerationList
          mark={mark}
          model={model}
          currentYear={THIS_YEAR}
          base={base}
          priorityCount={4}
        />
      </nav>

      {products.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-brand-900">
            {category.name} для {title} — всё, что подходит
          </h2>
          <Filtered products={products} currencySymbol={site.currencySymbol} />
        </section>
      )}

      <RelatedNav
        title={`Что ещё подходит к ${title}`}
        related={related}
        allUrl={modelUrl(mark.slug, model.slug)}
        allLabel={`Весь автосвет для ${title}`}
      />

      <Faq
        items={category.faq ?? []}
        title={`${category.name}: частые вопросы`}
      />
    </div>
  );
}

export function categoryGenerationMetadata({
  category,
  mark,
  model,
  generation,
}: GenerationScope): Metadata {
  const site = getSite();
  const products = getProductsForGeneration(generation.id, category.id);
  const period = years(generation, THIS_YEAR);
  const title = carName(mark, model, generation);

  return buildMetadata({
    title: `${category.name} для ${title}${period ? ` (${period})` : ""}`,
    description: sentences(
      `${category.name} для ${title}${period ? ` ${period}` : ""} — встают без доработок`,
      countLine(products, site.currencySymbol),
      "Проверяем каждый комплект на стенде. Доставка по Минску и Беларуси",
    ),
    path: generationUrl(
      mark.slug,
      model.slug,
      generation.slug,
      carsRoot(category.slug),
    ),
  });
}

export function CategoryGenerationView({
  category,
  mark,
  model,
  generation,
}: GenerationScope) {
  const site = getSite();
  const base = carsRoot(category.slug);
  const products = getProductsForGeneration(generation.id, category.id);
  const related = categoriesForGeneration(category, mark, model, generation);
  const period = years(generation, THIS_YEAR);
  const title = carName(mark, model, generation);

  const siblings = model.generations.filter(
    (item) => item.id !== generation.id,
  );

  return (
    <div className="container-page pb-16">
      <Breadcrumbs
        items={[
          ...crumbs(category),
          { label: mark.name, href: markUrl(mark.slug, base) },
          { label: model.name, href: modelUrl(mark.slug, model.slug, base) },
          { label: generation.name },
        ]}
      />
      <JsonLd
        data={itemListJsonLd(
          products,
          generationUrl(mark.slug, model.slug, generation.slug, base),
        )}
      />

      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">
          {category.name} для {title}
        </h1>
        {period && (
          <p className="mt-1.5 text-sm text-brand-400">Годы выпуска: {period}</p>
        )}
        <p className="mt-2.5 max-w-2xl text-base text-brand-500">
          {pluralize(products.length, "позиция", "позиции", "позиций")} на это
          поколение. Не уверены, что подойдёт — позвоните, проверим по VIN.
        </p>
      </header>

      <ProductGrid products={products} currencySymbol={site.currencySymbol} />

      {siblings.length > 0 && (
        <nav className="mt-14" aria-label={`Другие поколения ${model.name}`}>
          <h2 className="mb-4 text-lg font-semibold text-brand-900">
            {category.name} для других поколений {carName(mark, model)}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {siblings.map((item) => {
              const itemPeriod = years(item, THIS_YEAR);
              return (
                <li key={item.id}>
                  <Link
                    href={generationUrl(mark.slug, model.slug, item.slug, base)}
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

      <RelatedNav
        title={`Что ещё подходит к ${title}`}
        related={related}
        allUrl={generationUrl(mark.slug, model.slug, generation.slug)}
        allLabel={`Весь автосвет для ${title}`}
      />

      <Faq
        items={category.faq ?? []}
        title={`${category.name}: частые вопросы`}
      />
    </div>
  );
}
