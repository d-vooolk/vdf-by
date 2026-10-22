"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { FrameTypeStorageField } from "@/components/admin/FrameTypeStorageField";
import { FrameTypeStockField } from "@/components/admin/FrameTypeStockField";
import { startNavigationOverlay } from "@/components/admin/NavigationOverlay";
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
  initialStockOnly: boolean;
}

const QUERY_LENGTH = 10;
const PAGE_SIZE = 60;
const CHUNK_SIZE = 30;
const CHUNK_KEEP_MARGIN = 1500;

function listHref(categoryId: string, query: string, stockOnly: boolean): string {
  const params = new URLSearchParams({ category: categoryId });
  if (query) params.set("q", query);
  if (stockOnly) params.set("stock", "1");
  return `/admin/frame-types/?${params}`;
}

function normalizeQuery(value: string): string {
  return value.trim().toUpperCase().slice(0, QUERY_LENGTH);
}

export function FrameTypeList({
  rows,
  categories,
  categoryId,
  initialQuery,
  initialStockOnly,
}: FrameTypeListProps) {
  const router = useRouter();
  const [input, setInput] = useState(initialQuery);
  const [switching, startSwitching] = useTransition();
  const [stockOnly, setStockOnly] = useState(initialStockOnly);
  const [query, setQuery] = useState(normalizeQuery(initialQuery));
  const [searching, startSearching] = useTransition();
  const [filtering, startFiltering] = useTransition();
  const stale = searching || filtering;
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sentinel = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const stockRows = useMemo(() => rows.filter((row) => (row.stockQty ?? 0) > 0), [rows]);
  const filtered = stockOnly ? stockRows : rows;

  const shown = useMemo(
    () =>
      query
        ? filtered.filter((row) => row.type.startsWith(query) || row.name.toUpperCase().includes(query))
        : filtered,
    [filtered, query],
  );

  const chunks = useMemo(() => {
    const list: FrameTypeListRow[][] = [];
    for (let start = 0; start < shown.length; start += CHUNK_SIZE) list.push(shown.slice(start, start + CHUNK_SIZE));
    return list;
  }, [shown]);
  const visibleChunks = useMemo(() => chunks.slice(0, Math.ceil(limit / CHUNK_SIZE)), [chunks, limit]);
  const visibleCount = Math.min(limit, shown.length);
  const hasMore = visibleCount < shown.length;

  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLimit((current) => current + PAGE_SIZE);
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]);

  const search = () => {
    const next = normalizeQuery(input);
    window.history.replaceState(null, "", listHref(categoryId, next, stockOnly));
    startSearching(() => {
      setQuery(next);
      setLimit(PAGE_SIZE);
    });
  };

  const toggleStockOnly = () => {
    const next = !stockOnly;
    window.history.replaceState(null, "", listHref(categoryId, query, next));
    const form = formRef.current;
    if (form && form.getBoundingClientRect().top < 0) form.scrollIntoView({ block: "start", behavior: "instant" });
    startFiltering(() => {
      setStockOnly(next);
      setLimit(PAGE_SIZE);
    });
  };

  const changeCategory = (nextCategoryId: string) => {
    startNavigationOverlay();
    startSwitching(() => router.push(listHref(nextCategoryId, normalizeQuery(input), stockOnly)));
  };

  return (
    <>
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
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
            onChange={(event) => setInput(event.target.value)}
            maxLength={QUERY_LENGTH}
            placeholder="110N"
            autoComplete="off"
            className="field tnum w-36 py-2 text-sm"
          />
        </div>
        <button type="submit" disabled={searching} className="btn-secondary py-2 text-sm">
          {searching ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : "Найти"}
        </button>
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
          onClick={toggleStockOnly}
          aria-pressed={stockOnly}
          disabled={switching}
          className={`${stockOnly ? "btn-primary" : "btn-secondary"} ml-auto py-2 text-sm`}
        >
          В наличии
          {filtering ? (
            <SpinnerIcon className="h-4 w-4 animate-spin" />
          ) : (
            <span className="tnum opacity-70">{stockRows.length}</span>
          )}
        </button>
      </form>

      {shown.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          {!rows.length
            ? "Типов пока нет — создайте первый."
            : stockOnly && !stockRows.length
              ? "Типов в наличии нет."
              : stockOnly
                ? "Такого типа в наличии нет."
                : "Такого типа нет."}
        </p>
      ) : (
        <div className={`transition-opacity ${stale || switching ? "opacity-60" : ""}`}>
          <FrameTypeRows chunks={visibleChunks} categoryId={categoryId} />
          {hasMore && (
            <div ref={sentinel} className="flex items-center justify-center gap-3 py-6 text-sm text-brand-500">
              <button type="button" onClick={() => setLimit((current) => current + PAGE_SIZE)} className="btn-ghost text-sm">
                Показать ещё · <span className="tnum">{visibleCount} из {shown.length}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

const FrameTypeRows = memo(function FrameTypeRows({
  chunks,
  categoryId,
}: {
  chunks: FrameTypeListRow[][];
  categoryId: string;
}) {
  return (
    <div className="card overflow-hidden">
      {chunks.map((chunk) => (
        <FrameTypeChunk key={chunk[0].type} rows={chunk} categoryId={categoryId} />
      ))}
    </div>
  );
});

const FrameTypeChunk = memo(function FrameTypeChunk({
  rows,
  categoryId,
}: {
  rows: FrameTypeListRow[];
  categoryId: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const [placeholderHeight, setPlaceholderHeight] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPlaceholderHeight(entry.isIntersecting ? null : entry.boundingClientRect.height),
      { rootMargin: `${CHUNK_KEEP_MARGIN}px 0px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <ul
      ref={ref}
      className="-mt-px flex flex-col"
      style={placeholderHeight === null ? undefined : { height: placeholderHeight }}
    >
      {placeholderHeight === null &&
        rows.map((row) => <FrameTypeRow key={row.type} row={row} categoryId={categoryId} />)}
    </ul>
  );
});

const FrameTypeRow = memo(function FrameTypeRow({
  row,
  categoryId,
}: {
  row: FrameTypeListRow;
  categoryId: string;
}) {
  const categoryQuery = `?category=${encodeURIComponent(categoryId)}`;
  return (
    <li
      className="flex flex-wrap items-center gap-x-2 gap-y-3 border-t border-brand-100 px-4 py-3 hover:bg-brand-50 sm:gap-x-4"
    >
      <div className="order-last flex min-w-0 basis-full flex-wrap items-center gap-x-4 gap-y-1 sm:order-none sm:grow sm:basis-[26rem]">
        <Link
          href={`/admin/frame-types/${row.type}/${categoryQuery}`}
          prefetch={false}
          className="flex min-w-0 flex-1 basis-56 items-center gap-x-4"
        >
          <span className="tnum w-16 shrink-0 text-base font-semibold text-brand-900">
            {row.type}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-brand-900">
              {row.name || <span className="text-brand-400">без названия</span>}
            </span>
            <span className="block text-xs text-brand-500">
              <span className="tnum">{row.sku}</span>
              {" · "}
              {row.summary}
            </span>
          </span>
        </Link>
        <FrameTypeStorageField
          key={row.storageCode}
          categoryId={categoryId}
          type={row.type}
          initial={row.storageCode}
          mixed={row.storageMixed}
        />
        <span className="tnum w-24 text-sm text-brand-500">
          {row.productCount} {row.productCount === 1 ? "товар" : "товаров"}
        </span>
        {!row.uniform && (
          <span className="badge bg-amber-100 text-amber-900">у товаров разные значения</span>
        )}
      </div>
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
      <PrintLabelButton
        target={{ categoryId, type: row.type }}
        layout="number"
        className="p-2 text-brand-500 hover:text-brand-900"
      />
    </li>
  );
});
