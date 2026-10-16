"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { searchOrderVariantsAction, updateOrderItemsAction } from "@/app/admin/actions";
import { Problems } from "@/components/admin/form-parts";
import { MinusIcon, PlusIcon, SearchIcon, SpinnerIcon, TrashIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import type { OrderVariantOption } from "@/lib/order-catalog";
import type { OrderItem } from "@/lib/order-types";

interface OrderItemsProps {
  orderId: number;
  items: OrderItem[];
  subtotal: number;
  deliveryName: string;
  deliveryCost: number;
  total: number;
  currencySymbol: string;
  stockTaken: boolean;
}

interface DraftLine {
  key: string;
  title: string;
  options: string;
  sku: string | null;
  price: number;
  qty: number;
  url: string;
  stock: number | null;
  added: boolean;
}

const SEARCH_DELAY_MS = 300;

function draftFrom(items: OrderItem[]): DraftLine[] {
  return items.map((item) => ({ ...item, stock: null, added: false }));
}

export function OrderItems({
  orderId,
  items,
  subtotal,
  deliveryName,
  deliveryCost,
  total,
  currencySymbol,
  stockTaken,
}: OrderItemsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftLine[]>(() => draftFrom(items));
  const [problems, setProblems] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<OrderVariantOption[]>([]);
  const [searching, setSearching] = useState(false);

  const price = (value: number) => formatPrice(value, currencySymbol);

  useEffect(() => {
    const text = query.trim();
    if (!editing || text.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      searchOrderVariantsAction(orderId, text)
        .then((options) => {
          if (!cancelled) setFound(options);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, editing, orderId]);

  const startEditing = () => {
    setDraft(draftFrom(items));
    setProblems([]);
    setQuery("");
    setFound([]);
    setEditing(true);
  };

  const setQty = (key: string, qty: number) =>
    setDraft((lines) =>
      lines.map((line) => (line.key === key ? { ...line, qty: Math.max(1, Math.min(999, qty)) } : line)),
    );

  const removeLine = (key: string) => setDraft((lines) => lines.filter((line) => line.key !== key));

  const addOption = (option: OrderVariantOption) => {
    setDraft((lines) =>
      lines.some((line) => line.key === option.key)
        ? lines.map((line) => (line.key === option.key ? { ...line, qty: line.qty + 1 } : line))
        : [
            ...lines,
            {
              key: option.key,
              title: option.title,
              options: option.options,
              sku: option.sku,
              price: option.price,
              qty: 1,
              url: "",
              stock: option.stock,
              added: true,
            },
          ],
    );
    setQuery("");
    setFound([]);
  };

  const save = () => {
    setProblems([]);
    startTransition(async () => {
      const result = await updateOrderItemsAction(
        orderId,
        draft.map((line) => ({ key: line.key, qty: line.qty })),
      );
      if (!result.ok) {
        setProblems(result.problems);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  const draftSubtotal = draft.reduce((sum, line) => sum + line.price * line.qty, 0);

  if (!editing) {
    return (
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-brand-100 px-4 py-3">
          <h2 className="text-sm font-bold text-brand-900">Состав заказа</h2>
          <button type="button" onClick={startEditing} className="btn-secondary py-1.5 text-sm">
            Изменить состав
          </button>
        </div>

        <ul className="divide-y divide-brand-100">
          {items.map((item) => (
            <li key={item.key} className="flex gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                {item.url ? (
                  <Link
                    href={item.url}
                    target="_blank"
                    rel="noopener"
                    className="block text-sm font-medium text-brand-900 hover:text-brand-700"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-brand-900">{item.title}</p>
                )}
                <p className="text-xs text-brand-400">
                  {item.options && <span>{item.options} · </span>}
                  {item.sku && <span>арт. {item.sku} · </span>}
                  <span className="tnum">
                    {item.qty} × {price(item.price)}
                  </span>
                </p>
              </div>
              <p className="tnum shrink-0 text-sm font-semibold text-brand-900">{price(item.sum)}</p>
            </li>
          ))}
        </ul>

        <Totals
          subtotal={subtotal}
          deliveryName={deliveryName}
          deliveryCost={deliveryCost}
          total={total}
          price={price}
        />
      </section>
    );
  }

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-brand-100 px-4 py-3">
        <h2 className="text-sm font-bold text-brand-900">Изменение состава</h2>
        <p className="mt-0.5 text-xs text-brand-400">
          {stockTaken
            ? "Заказ выполнен: при сохранении склад пересчитается — лишнее вернётся, добавленное спишется."
            : "Цена у прежних позиций сохраняется, у добавленных берётся текущая из каталога."}
        </p>
      </div>

      <div className="px-4 pt-3">
        <Problems items={problems} />
      </div>

      <ul className="divide-y divide-brand-100">
        {draft.map((line) => (
          <li key={line.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-brand-900">
                {line.title}
                {line.added && (
                  <span className="badge ml-2 bg-green-100 text-green-800">новая</span>
                )}
              </p>
              <p className="text-xs text-brand-400">
                {line.options && <span>{line.options} · </span>}
                {line.sku && <span>арт. {line.sku} · </span>}
                <span className="tnum">{price(line.price)} за шт.</span>
                {line.stock !== null && <span> · на складе {line.stock}</span>}
              </p>
            </div>

            <div className="flex items-center rounded-xl border border-brand-200">
              <button
                type="button"
                onClick={() => setQty(line.key, line.qty - 1)}
                disabled={line.qty <= 1}
                className="p-2 text-brand-500 hover:text-brand-900 disabled:opacity-40"
                aria-label={`Уменьшить количество: ${line.title}`}
              >
                <MinusIcon className="h-3.5 w-3.5" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                value={line.qty}
                onChange={(event) => setQty(line.key, Number(event.target.value) || 1)}
                className="tnum w-12 border-0 bg-transparent p-0 text-center text-sm font-semibold focus:ring-0"
                aria-label={`Количество: ${line.title}`}
              />
              <button
                type="button"
                onClick={() => setQty(line.key, line.qty + 1)}
                className="p-2 text-brand-500 hover:text-brand-900"
                aria-label={`Увеличить количество: ${line.title}`}
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="tnum w-24 shrink-0 text-right text-sm font-semibold text-brand-900">
              {price(line.price * line.qty)}
            </p>

            <button
              type="button"
              onClick={() => removeLine(line.key)}
              className="rounded-xl p-2 text-brand-300 hover:bg-red-50 hover:text-red-600"
              aria-label={`Убрать из заказа: ${line.title}`}
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </li>
        ))}
        {draft.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-brand-400">
            Позиций не осталось — добавьте товар или отмените правку.
          </li>
        )}
      </ul>

      <div className="border-t border-brand-100 px-4 py-3">
        <label className="relative block">
          <span className="label">Добавить товар</span>
          <SearchIcon className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-brand-300" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value.trim().length < 2) setFound([]);
            }}
            placeholder="Название или артикул"
            className="field pl-9 text-sm"
          />
        </label>

        {searching && (
          <p className="mt-2 flex items-center gap-2 text-xs text-brand-400">
            <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
            Ищем…
          </p>
        )}
        {!searching && query.trim().length >= 2 && found.length === 0 && (
          <p className="mt-2 text-xs text-brand-400">Ничего не нашлось</p>
        )}
        {found.length > 0 && (
          <ul className="mt-2 max-h-72 divide-y divide-brand-100 overflow-y-auto rounded-xl border border-brand-200">
            {found.map((option) => (
              <li key={option.key}>
                <button
                  type="button"
                  onClick={() => addOption(option)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-brand-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-brand-900">{option.title}</span>
                    <span className="block truncate text-xs text-brand-400">
                      {[option.options, option.sku && `арт. ${option.sku}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    <span className="tnum block font-semibold text-brand-900">
                      {price(option.price)}
                    </span>
                    <span className={option.inStock ? "text-green-700" : "text-brand-400"}>
                      {option.stock !== null
                        ? `на складе ${option.stock}`
                        : option.inStock
                          ? "в наличии"
                          : "нет в наличии"}
                    </span>
                  </span>
                  <PlusIcon className="h-4 w-4 shrink-0 text-brand-500" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Totals
        subtotal={draftSubtotal}
        deliveryName={deliveryName}
        deliveryCost={deliveryCost}
        total={draftSubtotal + deliveryCost}
        price={price}
      />

      <div className="flex flex-wrap gap-2 border-t border-brand-100 px-4 py-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || draft.length === 0}
          className="btn-primary py-2 text-sm"
        >
          {pending ? (
            <>
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Сохраняем…
            </>
          ) : (
            "Сохранить состав"
          )}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="btn-ghost py-2 text-sm"
        >
          Отмена
        </button>
      </div>
    </section>
  );
}

function Totals({
  subtotal,
  deliveryName,
  deliveryCost,
  total,
  price,
}: {
  subtotal: number;
  deliveryName: string;
  deliveryCost: number;
  total: number;
  price: (value: number) => string;
}) {
  return (
    <dl className="space-y-2 border-t border-brand-100 px-4 py-3 text-sm">
      <div className="flex justify-between">
        <dt className="text-brand-500">Товары</dt>
        <dd className="tnum font-medium">{price(subtotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-brand-500">{deliveryName || "Доставка"}</dt>
        <dd className="tnum font-medium">
          {deliveryCost === 0 ? "бесплатно" : price(deliveryCost)}
        </dd>
      </div>
      <div className="flex justify-between border-t border-brand-100 pt-2">
        <dt className="font-bold text-brand-900">Итого</dt>
        <dd className="tnum text-lg font-semibold text-brand-900">{price(total)}</dd>
      </div>
    </dl>
  );
}
