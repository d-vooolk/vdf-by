import Link from "next/link";

import { AddToCartButton } from "@/components/AddToCartButton";
import { Picture } from "@/components/Picture";
import { formatPrice } from "@/lib/format";
import { pickUrl } from "@/lib/image-types";
import { getImage } from "@/lib/images";
import type { Product } from "@/lib/schema";
import {
  defaultSelection,
  hasAnyInStock,
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
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 280px"
          priority={priority}
          className={`h-full w-full object-contain transition-transform duration-300 ease-out group-hover:scale-[1.03] ${
            inStock ? "" : "opacity-60 grayscale"
          }`}
        />
        {product.badge && inStock && (
          <span className="badge absolute top-3 left-3 bg-accent-400 text-brand-900">
            {product.badge}
          </span>
        )}
        {range.varies === false && product.oldPrice && product.oldPrice > range.max && (
          <span className="badge absolute top-3 right-3 bg-red-500 text-white">
            −{Math.round((1 - range.max / product.oldPrice) * 100)}%
          </span>
        )}
        {!inStock && (
          <span className="badge absolute top-3 left-3 bg-brand-800/90 text-white backdrop-blur">
            Нет в наличии
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4 pt-3.5">
        {product.brand && (
          <p className="mb-1.5 text-[11px] font-semibold tracking-[0.1em] text-brand-300 uppercase">
            {product.brand}
          </p>
        )}

        <h3 className="mb-2 text-[15px] leading-snug font-semibold text-brand-900">
          <Link href={href} className="transition-colors hover:text-brand-500">
            {product.title}
          </Link>
        </h3>

        {hasOptions && (
          <p className="mb-2 line-clamp-1 text-xs text-brand-400">
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
        <div className="mt-auto pt-2">
          <div className={`flex items-baseline gap-2 ${hasOptions && inStock ? "" : "mb-3"}`}>
            <span className="tnum text-lg font-semibold text-brand-900">
              {formatPrice(range.min, currencySymbol)}
            </span>
            {!range.varies && product.oldPrice && product.oldPrice > range.max && (
              <span className="tnum text-sm text-brand-300 line-through">
                {formatPrice(product.oldPrice, currencySymbol)}
              </span>
            )}
          </div>

          {!inStock ? (
            <Link href={href} className="btn-secondary w-full">
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
