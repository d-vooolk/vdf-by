import Link from "next/link";

import { AddToCartButton } from "@/components/AddToCartButton";
import { Picture } from "@/components/Picture";
import { PriceTag } from "@/components/PriceTag";
import { formatPrice } from "@/lib/format";
import { pickUrl } from "@/lib/image-types";
import { getImage } from "@/lib/images";
import type { Product } from "@/lib/schema";
import {
  defaultSelection,
  hasAnyInStock,
  hasPrice,
  PRICE_ON_REQUEST,
  priceRange,
  resolveVariant,
} from "@/lib/variant";

/**
 * Карточка товара. Серверный компонент: в HTML уезжает готовая разметка,
 * в бандл — только кнопка «В корзину».
 *
 * У товара с опциями цену показываем диапазоном («от 84,90 р.»), а вместо
 * кнопки даём ссылку на страницу товара: цоколь с карточки не выберешь.
 *
 * Кнопок мессенджеров здесь нет намеренно. Они были, и в сетке из двадцати
 * карточек получалось шестьдесят одинаковых кружков — рябь, за которой не
 * видно товара. Спрашивают о конкретной позиции всё равно с её страницы,
 * там эти кнопки и стоят. Плюс панель связи висит справа на каждой
 * странице, так что написать можно и не заходя в карточку.
 */

interface ProductCardProps {
  product: Product;
  currencySymbol: string;
  /** Для первых карточек первого экрана — грузить фото сразу, не лениво. */
  priority?: boolean;
}

export function ProductCard({
  product,
  currencySymbol,
  priority = false,
}: ProductCardProps) {
  const range = priceRange(product);
  const inStock = hasAnyInStock(product);
  const hasOptions = product.optionGroups.length > 0;
  const priced = hasPrice(range.min);

  const imagePath = product.images[0];
  const entry = getImage(imagePath);
  const href = `/product/${product.slug}/`;

  const variant = resolveVariant(product, defaultSelection(product));

  return (
    <article className="group card card-link reveal flex w-full flex-col overflow-hidden">
      {/* Фото во всю ширину карточки: ни подложки, ни внутреннего отступа.
          Серый градиент .photo-bed по краям читался как рамка вокруг
          снимка, а отступ в пять единиц добавлял к ней ещё и поля — товар
          на карточке выглядел вставленным в паспарту. */}
      <Link
        href={href}
        className="relative block aspect-square overflow-hidden bg-white"
        tabIndex={-1}
        aria-hidden="true"
      >
        <Picture
          entry={entry}
          alt=""
          sizes="(max-width: 640px) 31vw, (max-width: 1024px) 24vw, 240px"
          priority={priority}
          className={`h-full w-full object-contain transition-transform duration-300 ease-out group-hover:scale-[1.03] ${
            inStock ? "" : "opacity-60 grayscale"
          }`}
        />
        {product.badge && inStock && (
          <span className="badge absolute top-1.5 left-1.5 bg-accent-400 px-1.5 py-0.5 text-[10px] text-brand-900 sm:top-3 sm:left-3 sm:px-2.5 sm:py-1 sm:text-xs">
            {product.badge}
          </span>
        )}
        {priced && range.varies === false && product.oldPrice && product.oldPrice > range.max && (
          <span className="badge absolute top-1.5 right-1.5 bg-red-500 px-1.5 py-0.5 text-[10px] text-white sm:top-3 sm:right-3 sm:px-2.5 sm:py-1 sm:text-xs">
            −{Math.round((1 - range.max / product.oldPrice) * 100)}%
          </span>
        )}
        {!inStock && (
          <span className="badge absolute top-1.5 left-1.5 bg-brand-800/90 px-1.5 py-0.5 text-[10px] text-white backdrop-blur sm:top-3 sm:left-3 sm:px-2.5 sm:py-1 sm:text-xs">
            Нет в наличии
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-2 pt-2 sm:p-4 sm:pt-3.5">
        {product.brand && (
          <p className="mb-1 truncate text-[9px] font-semibold tracking-[0.08em] text-brand-300 uppercase sm:mb-1.5 sm:text-[11px] sm:tracking-[0.1em]">
            {product.brand}
          </p>
        )}

        <h3 className="mb-1.5 text-xs leading-snug font-semibold break-words text-brand-900 sm:mb-2 sm:text-[15px]">
          <Link href={href} className="transition-colors hover:text-brand-500">
            {product.title}
          </Link>
        </h3>

        {hasOptions && (
          <p className="mb-2 line-clamp-1 text-[10px] text-brand-400 sm:text-xs">
            {product.optionGroups
              .map(
                (group) =>
                  `${group.name}: ${group.values.map((v) => v.label).join(", ")}`,
              )
              .join(" · ")}
          </p>
        )}

        {/* mt-auto прижимает цену и кнопку к низу — карточки в сетке
            выравниваются по нижнему краю независимо от длины названия. */}
        <div className="mt-auto pt-1 sm:pt-2">
          <div
            className={`flex flex-wrap items-baseline gap-x-1.5 sm:gap-x-2 ${
              hasOptions && inStock && priced ? "" : "mb-2 sm:mb-3"
            }`}
          >
            {priced ? (
              <PriceTag
                variantKey={variant.key}
                price={range.min}
                currencySymbol={currencySymbol}
                className="tnum text-sm font-semibold text-brand-900 sm:text-lg"
                wholesaleClassName="tnum text-sm font-semibold text-green-800 sm:text-lg"
                retailClassName="tnum text-[10px] text-brand-300 line-through sm:text-sm"
              />
            ) : (
              <span className="text-xs font-semibold text-brand-600 sm:text-base">
                {PRICE_ON_REQUEST}
              </span>
            )}
            {priced && !range.varies && product.oldPrice && product.oldPrice > range.max && (
              <span className="tnum text-[10px] text-brand-300 line-through sm:text-sm">
                {formatPrice(product.oldPrice, currencySymbol)}
              </span>
            )}
          </div>

          {!inStock || !priced ? (
            <Link href={href} className="btn-secondary w-full px-2 py-2 text-xs sm:px-5 sm:py-2.5 sm:text-sm">
              Подробнее
            </Link>
          ) : hasOptions ? null : (
            <AddToCartButton
              compact
              item={{
                key: variant.key,
                productId: product.id,
                slug: product.slug,
                title: product.title,
                optionLabel: "",
                options: [],
                price: variant.price,
                unit: product.unit,
                sku: variant.sku,
                imageUrl: pickUrl(entry, 200),
              }}
            />
          )}
        </div>
      </div>
    </article>
  );
}
