"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  setProductPriceAction,
  setProductStockQtyAction,
} from "@/app/admin/actions";
import { FOREIGN_CURRENCIES } from "@/lib/currency";
import type { ProductBrief } from "@/lib/store";

/**
 * Строка списка товаров.
 *
 * Правится прямо здесь — цена и складской остаток. Это два числа, которые
 * меняются чаще всего и по одной причине: пришла поставка или сменился
 * прайс поставщика. Открывать ради них карточку, листать её до нужного
 * поля и жать «Сохранить» — четыре лишних действия на каждую позицию, а
 * позиций за раз правят десяток.
 */

interface ProductRowProps {
  product: ProductBrief;
  categoryName: string;
  currencySymbol: string;
  thumb: string | null;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
}

export function ProductRow({
  product,
  categoryName,
  currencySymbol,
  thumb,
  selected,
  onSelect,
}: ProductRowProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    // flex-wrap: на телефоне поля цены и остатка не влезают в строку рядом с
    // названием и уезжают под него, а не пропадают совсем — править остатки
    // с телефона на складе удобнее, чем с ноутбука.
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors sm:px-4 ${
        pending ? "opacity-60" : ""
      } ${selected ? "bg-brand-50" : ""}`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(event) => onSelect(product.id, event.target.checked)}
        aria-label={`Выбрать «${product.title}»`}
        className="h-4 w-4 shrink-0 rounded border-brand-300 text-brand-700 focus:ring-brand-600"
      />

      <div className="photo-bed h-12 w-12 shrink-0 overflow-hidden rounded-lg">
        {thumb ? (
          // Обычный img: это админка, размытые заглушки и srcset тут не нужны.
          <img
            src={thumb}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[10px] text-brand-300">
            нет фото
          </span>
        )}
      </div>

      <div className="min-w-[12rem] flex-1">
        <Link
          href={`/admin/products/${product.id}/`}
          className="block truncate text-sm font-semibold text-brand-900 hover:text-brand-700"
        >
          {product.title}
        </Link>
        <p className="truncate text-xs text-brand-400">
          {categoryName}
          {product.brand ? ` · ${product.brand}` : ""} · /{product.slug}/
          {product.inStock ? "" : " · нет в наличии"}
          {product.priceSource
            ? ` · цена по курсу из ${product.priceSource.amount} ${FOREIGN_CURRENCIES[product.priceSource.currency]}`
            : ""}
        </p>
        {error && <p className="mt-0.5 text-xs text-red-600">{error}</p>}
      </div>

      {product.storageCode && (
        <span
          title="Складской номер — виден только в админке"
          className="tnum shrink-0 rounded-md bg-brand-100 px-2 py-1 text-xs font-medium text-brand-600"
        >
          {product.storageCode}
        </span>
      )}

      <InlineNumber
        value={product.price > 0 ? product.price : null}
        suffix={currencySymbol}
        title={
          product.priceSource
            ? `Цена по курсу: ${product.priceSource.amount} ${FOREIGN_CURRENCIES[product.priceSource.currency]}. Правка здесь отвяжет её от курса`
            : "Цена"
        }
        placeholder="нет"
        className="w-24"
        onSave={(next) =>
          startTransition(async () => {
            setError("");
            const result = await setProductPriceAction(product.id, next ?? 0);
            if (!result.ok) setError(result.problems.join(" "));
          })
        }
      />

      <InlineNumber
        value={product.stockQty}
        suffix="шт."
        title="Остаток на складе — виден на сайте, 0 или пусто — нет в наличии"
        placeholder="—"
        className="w-20"
        onSave={(next) =>
          startTransition(async () => {
            setError("");
            const result = await setProductStockQtyAction(product.id, next);
            if (!result.ok) setError(result.problems.join(" "));
          })
        }
      />

      <Link
        href={`/admin/products/new/?copy=${encodeURIComponent(product.id)}`}
        title="Копировать — откроется новый товар с данными этого"
        className="btn-ghost shrink-0 px-2 py-1 text-xs"
      >
        Копировать
      </Link>

      <Link
        href={`/product/${product.slug}/`}
        target="_blank"
        rel="noopener"
        title="Посмотреть на сайте"
        className="btn-ghost shrink-0 px-2 py-1 text-xs"
      >
        ↗
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface InlineNumberProps {
  value: number | null;
  suffix: string;
  title: string;
  placeholder?: string;
  className?: string;
  /** null — поле очистили: значит «не задано». */
  onSave: (value: number | null) => void;
}

/**
 * Число, которое правится на месте.
 *
 * Сохраняет по уходу фокуса и по Enter, а не на каждое нажатие клавиши:
 * иначе набор «100» отправил бы на сервер сначала 1, потом 10, потом 100 —
 * три записи в базу и три пересборки страниц вместо одной.
 *
 * Значение держится строкой. Числом его хранить нельзя: поле с number 0
 * показывает «0», и набранная поверх сотня превращается в «0100».
 */
function InlineNumber({
  value,
  suffix,
  title,
  placeholder,
  className = "",
  onSave,
}: InlineNumberProps) {
  const asText = (input: number | null) => (input === null ? "" : String(input));
  const [text, setText] = useState(() => asText(value));

  // Значение могло приехать новым с сервера — например, страница
  // перерисовалась после удаления соседних позиций. Правим состояние прямо
  // в рендере, а не в эффекте: эффект сделал бы это вторым проходом, и
  // между ними поле успело бы моргнуть старым числом.
  const [known, setKnown] = useState(value);
  if (value !== known) {
    setKnown(value);
    setText(asText(value));
  }

  const commit = () => {
    const trimmed = text.trim();
    const next = trimmed === "" ? null : Number(trimmed.replace(",", "."));
    if (next !== null && !Number.isFinite(next)) {
      setText(asText(value));
      return;
    }
    if (next === value) return; // ничего не поменялось — не трогаем сервер
    onSave(next);
  };

  return (
    <label className={`relative block shrink-0 ${className}`} title={title}>
      <span className="sr-only">{title}</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setText(asText(value));
        }}
        className="field tnum w-full py-1.5 pr-9 text-right text-sm"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-brand-300">
        {suffix}
      </span>
    </label>
  );
}
