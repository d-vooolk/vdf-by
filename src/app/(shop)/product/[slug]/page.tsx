import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Faq } from "@/components/Faq";
import { ProductCars } from "@/components/ProductCars";
import { JsonLd } from "@/components/JsonLd";
import { ProductCard } from "@/components/ProductCard";
import { ProductPurchase } from "@/components/ProductPurchase";
import {
  categoryTrail,
  categoryUrl,
  getCategoryById,
  getProductBySlug,
  getProducts,
  getRelatedProducts,
  getSite,
} from "@/lib/catalog";
import { carsRoot } from "@/lib/car-types";
import { getProductCars, getProductsForSameCars } from "@/lib/cars";
import { getMessengers, productMessage } from "@/lib/contacts";
import { formatPrice } from "@/lib/format";
import { pickImages } from "@/lib/images";
import { findRedirect } from "@/lib/redirects";
import { buildMetadata, productJsonLd } from "@/lib/seo";
import { productSnippet } from "@/lib/snippet";
import { allProductImages, hasPrice, priceRange } from "@/lib/variant";

export function generateStaticParams() {
  return getProducts().map((product) => ({ slug: product.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return {};

  const site = getSite();
  const category = getCategoryById(product.categoryId);

  const snippet = productSnippet({
    product,
    categoryName: category?.name,
    currencySymbol: site.currencySymbol,
  });

  return buildMetadata({
    title: snippet.title,
    description: snippet.description,
    path: `/product/${product.slug}/`,
    image: product.images[0],
  });
}

/**
 * Постоянная переадресация на новый адрес или честный 404.
 *
 * permanentRedirect, а не redirect: 308 говорит поисковику перенести вес
 * старой страницы на новую, а временный 307 оставил бы в индексе обе.
 */
function redirectOr404(path: string): never {
  const target = findRedirect(path);
  if (target) permanentRedirect(target);
  notFound();
}

/** Короткая строка о доставке для блока рядом с кнопкой заказа. */
function deliveryNote(): string {
  const site = getSite();
  const minsk = site.delivery.methods.find((method) => method.id === "minsk");
  if (!minsk) return "Доставка по Минску и Беларуси.";
  const free = minsk.freeFrom
    ? ` Бесплатно от ${formatPrice(minsk.freeFrom, site.currencySymbol)}.`
    : "";
  return `Доставка по Минску — ${formatPrice(minsk.price, site.currencySymbol)}.${free} Самовывоз бесплатно.`;
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  // Товара по этому адресу нет — но, может быть, он просто переехал. Поиск
  // по таблице переадресаций достаётся только таким запросам: у настоящих
  // адресов страница уже собрана и до сюда дело не доходит.
  if (!product) redirectOr404(`/product/${slug}/`);

  const site = getSite();
  const category = getCategoryById(product.categoryId);
  const sameCar = getProductsForSameCars(product.id, 10);
  const sameCarIds = new Set(sameCar.map((item) => item.id));
  const related = getRelatedProducts(product, 5 + sameCar.length)
    .filter((item) => !sameCarIds.has(item.id))
    .slice(0, 5);
  const cars = category?.carFitment ? getProductCars(product.id) : [];

  // В клиентский компонент уходят записи манифеста только для фото этого
  // товара — включая галереи всех опций, чтобы переключение цоколя работало
  // без дополнительных запросов.
  const images = pickImages(allProductImages(product));

  const range = priceRange(product);
  const messengers = getMessengers(
    site,
    productMessage(
      site,
      product,
      hasPrice(range.min)
        ? `${range.varies ? "от " : ""}${formatPrice(range.min, site.currencySymbol)}`
        : undefined,
    ),
  );

  // Быстрый заказ адрес не спрашивает, поэтому по умолчанию помечаем его
  // способом без адреса — самовывозом. Если такого в настройках нет, берём
  // первый: менеджер всё равно согласует доставку в звонке.
  const quickDelivery =
    site.delivery.methods.find((method) => !method.requiresAddress) ??
    site.delivery.methods[0];

  return (
    <div className="container-page max-w-[1120px]">
      <Breadcrumbs
        items={[
          { label: "Каталог", href: "/catalog/" },
          // Для товара из подраздела в крошки попадает вся цепочка:
          // «Каталог › Аксессуары › Декоративные маски › товар».
          ...(category
            ? categoryTrail(category).map((entry) => ({
                label: entry.name,
                href: categoryUrl(entry),
              }))
            : []),
          { label: product.title },
        ]}
      />
      <JsonLd data={productJsonLd(product, category)} />

      <header className="mb-5">
        {product.brand && (
          <p className="mb-1.5 text-sm font-medium tracking-wide text-brand-400 uppercase">
            {product.brand}
          </p>
        )}
        <h1 className="text-3xl font-semibold text-brand-900 lg:text-[2.25rem] lg:leading-[1.15]">
          {product.title}
        </h1>
      </header>

      <ProductPurchase
        product={product}
        images={images}
        currencySymbol={site.currencySymbol}
        currency={site.currency}
        deliveryNote={deliveryNote()}
        warranty={site.warranty}
        orderEndpoint={site.orderEndpoint}
        quickDeliveryId={quickDelivery.id}
        phone={site.phone}
        phoneHref={site.phoneHref}
        messengers={messengers}
      />

      {/* -------------------- Описание и характеристики ------------------ */}
      <div className="mt-14 grid gap-10 border-t border-brand-100 pt-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
        {/* Описание под галереей, а не над ней: под заголовком оно
            отодвигало от первого экрана галерею, цену и кнопку заказа — то,
            за чем на страницу товара и приходят. В поиске от этого ничего не
            меняется: в описание страницы первый абзац попадает через
            generateMetadata, а не из этого места вёрстки. */}
        {product.description && (
          <section className="prose-shop">
            <h2 className="mb-4 text-xl font-semibold text-brand-900">Описание</h2>
            {product.description.split("\n\n").map((paragraph, index) => (
              <p
                key={index}
                className={index === 0 ? "text-base text-brand-900" : undefined}
              >
                {paragraph}
              </p>
            ))}
          </section>
        )}

        {product.specs.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-semibold text-brand-900">
              Характеристики
            </h2>
            <dl className="card divide-y divide-brand-100 overflow-hidden">
              {product.specs.map((spec) => (
                <div
                  key={spec.name}
                  className="flex items-baseline justify-between gap-4 px-4 py-3"
                >
                  <dt className="text-sm text-brand-400">{spec.name}</dt>
                  <dd className="text-right text-sm font-medium text-brand-900">
                    {spec.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        <ProductCars cars={cars} base={carsRoot(category?.slug)} />
      </div>

      {sameCar.length > 0 && (
        <section className="mt-14 border-t border-brand-100 pt-10">
          <h2 className="mb-6 text-xl font-semibold text-brand-900 sm:text-2xl">
            Товары для этого же авто
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
            {sameCar.map((item) => (
              <ProductCard key={item.id} product={item} currencySymbol={site.currencySymbol} />
            ))}
          </div>
        </section>
      )}

      <Faq items={product.faq ?? []} schema />

      {/* ------------------------- Похожие товары ----------------------- */}
      {related.length > 0 && (
        <section className="mt-14 border-t border-brand-100 pt-10">
          <h2 className="mb-6 text-xl font-semibold text-brand-900 sm:text-2xl">
            Смотрите также
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
            {related.map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                currencySymbol={site.currencySymbol}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
