"use client";

import Link from "next/link";

import { CartIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { useWholesalePrice } from "@/store/account";
import { useCart, useHydrated, type CartItem } from "@/store/cart";

/**
 * Кнопка «В корзину», а после добавления — счётчик и ссылка в корзину.
 *
 * Раньше кнопка на две секунды превращалась в «Добавлено» и возвращалась к
 * исходной надписи. Получалось, что единственный след действия исчезал сам:
 * человек отвлекался на секунду и потом не мог понять, положил он товар или
 * нет, а чтобы это выяснить — шёл в корзину. Теперь состояние не пропадает:
 * пока позиция в корзине, на месте кнопки стоит её количество, которое тут
 * же можно поправить, и ссылка «В корзину» рядом.
 *
 * Количество берётся прямо из хранилища, а не из локального состояния: если
 * тот же товар лежит на странице дважды (карточка в «Смотрите также» и в
 * сетке каталога), оба места показывают одно и то же число.
 */

interface AddToCartButtonProps {
  item: Omit<CartItem, "qty">;
  /** Сколько добавить за одно нажатие. */
  qty?: number;
  disabled?: boolean;
  className?: string;
  label?: string;
  /** Компактный вид для карточки в сетке каталога. */
  compact?: boolean;
}

export function AddToCartButton({
  item: retailItem,
  qty = 1,
  disabled = false,
  className = "btn-primary w-full",
  label = "В корзину",
  compact = false,
}: AddToCartButtonProps) {
  const wholesale = useWholesalePrice(retailItem.key);
  const item = wholesale ? { ...retailItem, price: wholesale } : retailItem;
  const add = useCart((state) => state.add);
  const setQty = useCart((state) => state.setQty);
  const inCart = useCart(
    (state) => state.items.find((line) => line.key === item.key)?.qty ?? 0,
  );
  // HTML собран на сборке, когда корзина пуста. Пока гидратация не прошла,
  // показываем кнопку — иначе React пожалуется на расхождение разметки.
  const hydrated = useHydrated();

  if (!hydrated || inCart === 0) {
    return (
      <button
        type="button"
        onClick={() => add(item, qty)}
        disabled={disabled}
        className={
          compact ? `${className} px-2 py-2 text-xs sm:px-5 sm:py-2.5 sm:text-sm` : className
        }
      >
        <CartIcon className={`h-4 w-4 shrink-0 ${compact ? "hidden sm:block" : ""}`} />
        {label}
      </button>
    );
  }

  /*
   * В карточке каталога счётчик и ссылка стоят друг под другом, а не в
   * строку. В сетке на телефоне карточка шириной меньше половины экрана —
   * счётчик со стрелками занимал её целиком, а кнопка «В корзину» уезжала
   * за правый край и становилась недоступной. Столбиком обе помещаются при
   * любой ширине.
   *
   * На странице товара места хватает, там остаётся строка.
   */
  return (
    <div
      className={`flex w-full gap-2 ${compact ? "flex-col" : "items-stretch"}`}
    >
      <div
        className={`flex items-center rounded-control border border-brand-200 bg-white ${
          compact ? "w-full justify-between" : "shrink-0"
        }`}
      >
        <button
          type="button"
          onClick={() => setQty(item.key, inCart - 1)}
          className={`py-2 text-brand-500 transition-colors hover:text-brand-900 ${
            compact ? "px-1.5 sm:px-2.5" : "px-2.5"
          }`}
          aria-label={inCart === 1 ? "Убрать из корзины" : "Уменьшить количество"}
        >
          <MinusIcon className="h-4 w-4" />
        </button>
        <span
          className="tnum min-w-7 text-center text-sm font-semibold text-brand-900"
          aria-live="polite"
          aria-label={`В корзине: ${inCart}`}
        >
          {inCart}
        </span>
        <button
          type="button"
          onClick={() => add(item, 1)}
          className={`py-2 text-brand-500 transition-colors hover:text-brand-900 ${
            compact ? "px-1.5 sm:px-2.5" : "px-2.5"
          }`}
          aria-label="Увеличить количество"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      <Link
        href="/cart/"
        className={`btn-primary min-w-0 whitespace-nowrap ${
          compact ? "w-full px-2 py-2 text-xs sm:px-3" : "flex-1 px-3 text-sm"
        }`}
      >
        <CartIcon className={`h-4 w-4 shrink-0 ${compact ? "hidden sm:block" : ""}`} />
        {compact ? "В корзину" : "Перейти в корзину"}
      </Link>
    </div>
  );
}
