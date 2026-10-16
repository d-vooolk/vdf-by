"use client";

import Link from "next/link";

import { MinusIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { ImagePlaceholder } from "@/components/Picture";
import { formatPrice } from "@/lib/format";
import { lineLimit, useCart, type CartItem } from "@/store/cart";

/** Список позиций корзины с изменением количества и удалением. */
export function CartLines({
  items,
  currencySymbol,
}: {
  items: CartItem[];
  currencySymbol: string;
}) {
  const setQty = useCart((state) => state.setQty);
  const remove = useCart((state) => state.remove);

  return (
    <ul className="card divide-y divide-brand-100">
      {items.map((line) => (
        <li key={line.key} className="flex gap-4 p-4">
          <Link
            href={`/product/${line.slug}/`}
            className="photo-bed flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl sm:h-24 sm:w-24"
          >
            {line.imageUrl ? (
              <img
                src={line.imageUrl}
                alt=""
                width={96}
                height={96}
                loading="lazy"
                className="h-full w-full object-contain p-1.5"
              />
            ) : (
              <ImagePlaceholder className="h-full w-full" />
            )}
          </Link>

          <div className="min-w-0 flex-1">
            <Link
              href={`/product/${line.slug}/`}
              className="text-[15px] leading-snug font-semibold text-brand-900 hover:text-brand-700"
            >
              {line.title}
            </Link>

            {line.options.length > 0 && (
              <p className="mt-1 text-xs text-brand-400">
                {line.options
                  .map((option) => `${option.groupName}: ${option.label}`)
                  .join(" · ")}
              </p>
            )}
            {line.unit && (
              <p className="mt-0.5 text-xs text-brand-400">за {line.unit}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center rounded-xl border border-brand-200">
                <button
                  type="button"
                  onClick={() => setQty(line.key, line.qty - 1)}
                  className="p-2.5 text-brand-500 hover:text-brand-900"
                  aria-label={`Уменьшить количество: ${line.title}`}
                >
                  <MinusIcon className="h-3.5 w-3.5" />
                </button>
                <span className="tnum w-8 text-center text-sm font-semibold">
                  {line.qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(line.key, line.qty + 1)}
                  disabled={line.qty >= lineLimit(line)}
                  className="p-2.5 text-brand-500 hover:text-brand-900 disabled:opacity-40 disabled:hover:text-brand-500"
                  aria-label={`Увеличить количество: ${line.title}`}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              {line.stock !== undefined && line.qty >= line.stock && (
                <span className="text-xs text-brand-400">
                  В наличии {line.stock} шт. — это всё
                </span>
              )}

              <div className="flex items-center gap-3">
                <span className="text-right">
                  <span className="tnum block text-base font-bold text-brand-900">
                    {formatPrice(line.price * line.qty, currencySymbol)}
                  </span>
                  {line.qty > 1 && (
                    <span className="tnum block text-xs text-brand-400">
                      {formatPrice(line.price, currencySymbol)} × {line.qty}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => remove(line.key)}
                  className="rounded-xl p-2 text-brand-300 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Удалить из корзины: ${line.title}`}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
