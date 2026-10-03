"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteProductsAction } from "@/app/admin/actions";
import { ProductRow } from "@/components/admin/ProductRow";
import { Problems } from "@/components/admin/form-parts";
import { SpinnerIcon, TrashIcon } from "@/components/icons";
import { pluralize } from "@/lib/format";
import type { ProductBrief } from "@/lib/store";

/**
 * Список товаров с отметками и удалением пачкой.
 *
 * Выделение живёт здесь, а не в строках: строке нужно знать только про
 * себя, а «выбрать все» и счётчик выбранного — про всех сразу.
 *
 * Удаление подтверждается второй кнопкой, а не window.confirm: системный
 * диалог в браузере выглядит одинаково и для «удалить один товар», и для
 * «удалить сорок», а разница между этими действиями большая.
 */

interface ProductsTableProps {
  rows: ProductBrief[];
  categoryNames: Record<string, string>;
  thumbs: Record<string, string | null>;
}

export function ProductsTable({
  rows,
  categoryNames,
  thumbs,
}: ProductsTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const toggle = (id: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    setConfirming(false);
  };

  const allOnPage = rows.length > 0 && rows.every((row) => selected.has(row.id));

  const toggleAll = (on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const row of rows) {
        if (on) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
    setConfirming(false);
  };

  const removeSelected = () => {
    setProblems([]);
    startTransition(async () => {
      const result = await deleteProductsAction([...selected]);
      if (!result.ok) {
        setProblems(result.problems);
        return;
      }
      setSelected(new Set());
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <Problems items={problems} />

      {/* Шапка списка: «выбрать всё» и действия над выбранным. */}
      <div className="card flex flex-wrap items-center gap-3 px-3 py-2.5 sm:px-4">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-brand-600">
          <input
            type="checkbox"
            checked={allOnPage}
            onChange={(event) => toggleAll(event.target.checked)}
            className="h-4 w-4 rounded border-brand-300 text-brand-700 focus:ring-brand-600"
          />
          Выбрать все на странице
        </label>

        {selected.size > 0 && (
          <>
            <span className="tnum text-sm font-semibold text-brand-900">
              выбрано {selected.size}
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="btn-ghost py-1.5 text-xs"
            >
              Снять
            </button>

            <div className="ml-auto flex items-center gap-2">
              {confirming ? (
                <>
                  <span className="text-xs text-red-700">
                    Удалить{" "}
                    {pluralize(selected.size, "товар", "товара", "товаров")}{" "}
                    навсегда?
                  </span>
                  <button
                    type="button"
                    onClick={removeSelected}
                    disabled={pending}
                    className="btn-primary bg-red-700 py-1.5 text-xs hover:bg-red-800"
                  >
                    {pending ? (
                      <>
                        <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                        Удаляем…
                      </>
                    ) : (
                      "Да, удалить"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="btn-ghost py-1.5 text-xs"
                  >
                    Отмена
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="btn-ghost py-1.5 text-xs text-red-700 hover:bg-red-50"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Удалить выбранные
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div
        className={`card divide-y divide-brand-100 overflow-hidden ${
          pending ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {rows.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            categoryName={categoryNames[product.categoryId] ?? "—"}
            thumb={thumbs[product.id] ?? null}
            selected={selected.has(product.id)}
            onSelect={toggle}
          />
        ))}
      </div>
    </div>
  );
}
