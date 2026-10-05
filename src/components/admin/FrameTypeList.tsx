"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { FrameTypeStockField } from "@/components/admin/FrameTypeStockField";
import { PrintLabelButton } from "@/components/admin/PrintLabelButton";
import { CopyIcon, SpinnerIcon } from "@/components/icons";

export interface FrameTypeListRow {
  type: string;
  name: string;
  sku: string;
  summary: string;
  storageCode: string;
  storageMixed: boolean;
  productCount: number;
  uniform: boolean;
  stockQty: number | null;
}

interface FrameTypeListProps {
  rows: FrameTypeListRow[];
  categories: Array<{ id: string; name: string }>;
  categoryId: string;
  initialQuery: string;
  initialStockFirst: boolean;
}

const QUERY_LENGTH = 10;
const URL_SYNC_DELAY = 400;

function listHref(categoryId: string, query: string, stockFirst: boolean): string {
  const params = new URLSearchParams({ category: categoryId });
  if (query) params.set("q", query);
  if (stockFirst) params.set("stock", "1");
  return `/admin/frame-types/?${params}`;
}

function normalizeQuery(value: string): string {
  return value.trim().toUpperCase().slice(0, QUERY_LENGTH);
}

const inStock = (row: FrameTypeListRow) => (row.stockQty ?? 0) > 0;

export function FrameTypeList({
  rows,
  categories,
  categoryId,
  initialQuery,
  initialStockFirst,
}: FrameTypeListProps) {
  const router = useRouter();
  const [input, setInput] = useState(initialQuery);
  const [stockFirst, setStockFirst] = useState(initialStockFirst);
  const [switching, startSwitching] = useTransition();
  const query = useDeferredValue(normalizeQuery(input));
  const stale = query !== normalizeQuery(input);
  const urlTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const shown = useMemo(
    () =>
      query
        ? rows.filter((row) => row.type.startsWith(query) || row.name.toUpperCase().includes(query))
        : rows,
    [rows, query],
  );
  const stockCount = useMemo(() => rows.filter(inStock).length, [rows]);

  useEffect(() => () => clearTimeout(urlTimer.current), []);

  const remember = (nextInput: string, nextStockFirst: boolean) => {
    clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(
      () =>
        window.history.replaceState(
          null,
          "",
          listHref(categoryId, normalizeQuery(nextInput), nextStockFirst),
        ),
      URL_SYNC_DELAY,
    );
  };

  const changeQuery = (value: string) => {
    setInput(value);
    remember(value, stockFirst);
  };

  const toggleStockFirst = () => {
    setStockFirst(!stockFirst);
    remember(input, !stockFirst);
  };

  const changeCategory = (nextCategoryId: string) =>
    startSwitching(() => router.push(listHref(nextCategoryId, normalizeQuery(input), stockFirst)));

  return (
    <>
      <form
        onSubmit={(event) => event.preventDefault()}
        className="card flex flex-wrap items-end gap-3 p-4"
      >
        <div>
          <label htmlFor="q" className="label">
            Тип или название
          </label>
          <input
            id="q"
            type="search"
            value={input}
            onChange={(event) => changeQuery(event.target.value)}
            maxLength={QUERY_LENGTH}
            placeholder="110N"
            autoComplete="off"
            className="field tnum w-36 py-2 text-sm"
          />
        </div>
        {categories.length > 1 && (
          <div>
            <label htmlFor="category" className="label">
              Раздел
            </label>
            <select
              id="category"
              value={categoryId}
              onChange={(event) => changeCategory(event.target.value)}
              disabled={switching}
              className="field py-2 text-sm"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {switching && <SpinnerIcon className="mb-2.5 h-5 w-5 animate-spin text-brand-500" />}
        <button
          type="button"
          onClick={toggleStockFirst}
          aria-pressed={stockFirst}
          className={`${stockFirst ? "btn-primary" : "btn-secondary"} ml-auto py-2 text-sm`}
        >
          Сначала в наличии <span className="tnum opacity-70">{stockCount}</span>
        </button>
      </form>

      {shown.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          {rows.length ? "Такого типа нет." : "Типов пока нет — создайте первый."}
        </p>
      ) : (
        <div
          data-stock-first={stockFirst || undefined}
          className={`group/list transition-opacity ${stale || switching ? "opacity-60" : ""}`}
        >
          <FrameTypeRows rows={shown} categoryId={categoryId} />
        </div>
      )}
    </>
  );
}

const FrameTypeRows = memo(function FrameTypeRows({
  rows,
  categoryId,
}: {
  rows: FrameTypeListRow[];
  categoryId: string;
}) {
  const categoryQuery = `?category=${encodeURIComponent(categoryId)}`;
  return (
    <div className="card overflow-hidden">
      <ul className="-mt-px flex flex-col">
        {rows.map((row) => (
          <li
            key={row.type}
            data-in-stock={inStock(row) || undefined}
            className="flex flex-wrap items-center gap-x-2 gap-y-3 border-t border-brand-100 px-4 py-3 hover:bg-brand-50 [contain-intrinsic-size:auto_4.5rem] [content-visibility:auto] group-data-stock-first/list:data-in-stock:order-first sm:gap-x-4"
          >
            <Link
              href={`/admin/frame-types/${row.type}/${categoryQuery}`}
              prefetch={false}
              className="order-last flex min-w-0 basis-full flex-wrap items-center gap-x-4 gap-y-1 sm:order-none sm:grow sm:basis-[26rem]"
            >
              <span className="tnum w-16 text-base font-semibold text-brand-900">{row.type}</span>
              <span className="min-w-0 flex-1 basis-40">
                <span className="block truncate text-sm text-brand-900">
                  {row.name || <span className="text-brand-400">без названия</span>}
                </span>
                <span className="block text-xs text-brand-500">
                  <span className="tnum">{row.sku}</span>
                  {" · "}
                  {row.summary}
                </span>
              </span>
              <span
                className="tnum w-28 truncate text-sm text-brand-700"
                title="Складской номер — входит в артикул товаров типа"
              >
                {row.storageCode ? (
                  <>склад: {row.storageCode}</>
                ) : (
                  <span className="text-brand-400">
                    {row.storageMixed ? "склад: разный" : "склад: —"}
                  </span>
                )}
              </span>
              <span className="tnum w-24 text-sm text-brand-500">
                {row.productCount} {row.productCount === 1 ? "товар" : "товаров"}
              </span>
              {!row.uniform && (
                <span className="badge bg-amber-100 text-amber-900">у товаров разные значения</span>
              )}
            </Link>
            <FrameTypeStockField
              categoryId={categoryId}
              type={row.type}
              initial={row.stockQty}
              className="order-first sm:order-last"
            />
            <Link
              href={`/admin/frame-types/new/${categoryQuery}&from=${encodeURIComponent(row.type)}`}
              prefetch={false}
              title="Копировать тип"
              aria-label={`Копировать тип ${row.type}`}
              className="btn-ghost ml-auto p-2 text-brand-500 hover:text-brand-900 sm:ml-0"
            >
              <CopyIcon className="h-4 w-4" />
            </Link>
            <PrintLabelButton
              target={{ categoryId, type: row.type }}
              className="p-2 text-brand-500 hover:text-brand-900"
            />
          </li>
        ))}
      </ul>
    </div>
  );
});
