import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { Breadcrumbs } from "@/components/Breadcrumbs";
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
import { getProductCars } from "@/lib/cars";
import { getMessengers, productMessage } from "@/lib/contacts";
import { formatPrice } from "@/lib/format";
import { pickImages } from "@/lib/images";
import { findRedirect } from "@/lib/redirects";
import { buildMetadata, productJsonLd, sentences } from "@/lib/seo";
import { allProductImages, priceRange } from "@/lib/variant";

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
  const range = priceRange(product);
  const category = getCategoryById(product.categoryId);

  // В title входит цена: в выдаче такой сниппет заметно кликабельнее.
  const priceLabel = range.varies
    ? `от ${formatPrice(range.min, site.currencySymbol)}`
    : formatPrice(range.min, site.currencySymbol);

  return buildMetadata({
    title: product.seoTitle ?? `${product.title} — ${priceLabel}`,
    description:
      product.seoDescription ??
      sentences(
        product.excerpt ?? product.title,
        priceLabel,
        category && `${category.name} с доставкой по Минску и Беларуси`,
        "Оплата при получении",
      ),
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
  const related = getRelatedProducts(product);
  const cars = getProductCars(product.id);

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
      `${range.varies ? "от " : ""}${formatPrice(range.min, site.currencySymbol)}`,
    ),
  );

  // Быстрый заказ адрес не спрашивает, поэтому по умолчанию помечаем его
  // способом без адреса — самовывозом. Если такого в настройках нет, берём
  // первый: менеджер всё равно согласует доставку в звонке.
  const quickDelivery =
    site.delivery.methods.find((method) => !method.requiresAddress) ??
    site.delivery.methods[0];

  return (
    <div className="container-page">
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

      <header className="mb-7">
        {product.brand && (
          <p className="mb-1.5 text-sm font-medium tracking-wide text-brand-400 uppercase">
            {product.brand}
          </p>
        )}
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
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
        {/* Короткое описание — первым абзацем перед полным, а не под
            заголовком, как раньше. Под заголовком оно отодвигало от первого
            экрана галерею, цену и кнопку заказа — то, за чем на страницу
            товара и приходят. В поиске от переноса ничего не изменилось:
            в описание страницы excerpt попадает через generateMetadata,
            а не из этого места вёрстки. */}
        {(product.excerpt || product.description) && (
          <section className="prose-shop">
            <h2 className="mb-4 text-xl font-semibold text-brand-900">Описание</h2>
            {product.excerpt && (
              <p className="text-base text-brand-900">{product.excerpt}</p>
            )}
            {product.description?.split("\n\n").map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
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
        <ProductCars cars={cars} />
      </div>

      {/* ------------------------- Похожие товары ----------------------- */}
      {related.length > 0 && (
        <section className="mt-14 border-t border-brand-100 pt-10">
          <h2 className="mb-6 text-xl font-semibold text-brand-900 sm:text-2xl">
            Смотрите также
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
