"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { CloseIcon, SearchIcon, SpinnerIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { searchProducts, type SearchEntry } from "@/lib/search";

/**
 * Поиск по каталогу с подсказками.
 *
 * Индекс качается один раз при первом касании поля — до этого момента вес
 * поиска для страницы нулевой. Никакого стороннего сервиса поиска: 300–1000
 * товаров фильтруются в браузере за доли миллисекунды.
 */

export function SearchBox({ currencySymbol }: { currencySymbol: string }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [expanded, setExpanded] = useState(false);

  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const loadIndex = () => {
    if (index || loading) return;
    setLoading(true);
    fetch("/search-index.json")
      .then((response) => (response.ok ? response.json() : []))
      .then((data: SearchEntry[]) => setIndex(data))
      // Если индекс не подгрузился, поиск просто не даёт подсказок —
      // страница каталога с фильтрами остаётся рабочей.
      .catch(() => setIndex([]))
      .finally(() => setLoading(false));
  };

  const matches = index ? searchProducts(index, query, Infinity) : [];
  const results = matches.slice(0, 8);
  const searchUrl = `/poisk/?q=${encodeURIComponent(query.trim())}`;

  const close = () => {
    setOpen(false);
    setExpanded(false);
    inputRef.current?.blur();
  };

  const expand = () => {
    flushSync(() => setExpanded(true));
    inputRef.current?.focus();
  };

  const openSearchPage = () => {
    close();
    router.push(searchUrl);
  };

  useEffect(() => {
    if (!open && !expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setExpanded(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, expanded]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (active >= 0 && results[active]) {
        close();
        router.push(`/product/${results[active].s}/`);
      } else if (query.trim().length >= 2) {
        openSearchPage();
      }
      return;
    }
    if (!results.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current <= 0 ? results.length - 1 : current - 1));
    }
  };

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={rootRef} className="relative flex w-full justify-end md:block">
      <button
        type="button"
        onClick={expand}
        className="rounded-control p-2 text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-900 md:hidden"
        aria-label="Поиск"
      >
        <SearchIcon className="h-6 w-6" />
      </button>

      <div
        className={
          expanded
            ? "fixed inset-x-0 top-0 z-50 flex h-16 items-center gap-2 border-b border-brand-100 bg-white px-3 md:static md:block md:h-auto md:border-0 md:bg-transparent md:p-0"
            : "hidden md:block"
        }
      >
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-brand-300" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Поиск: лампы H7, стекло Golf, артикул…"
            className="field py-2.5 pr-10 pl-11"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            onFocus={() => {
              loadIndex();
              setOpen(true);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
          {loading && (
            <SpinnerIcon className="absolute top-1/2 right-3.5 h-5 w-5 -translate-y-1/2 animate-spin text-brand-300" />
          )}
          {!loading && query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg p-1.5 text-brand-300 hover:bg-brand-50 hover:text-brand-500"
              aria-label="Очистить поиск"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        {expanded && (
          <button
            type="button"
            onClick={close}
            className="shrink-0 px-2 py-2 text-sm font-medium text-brand-600 md:hidden"
          >
            Отмена
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          id={listId}
          role="listbox"
          className="fixed inset-x-3 top-16 z-50 mt-2 overflow-hidden rounded-xl border border-brand-100 bg-white shadow-xl md:absolute md:inset-x-0 md:top-full"
        >
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-brand-400">
              {index === null
                ? "Загружаем каталог…"
                : "Ничего не нашли. Попробуйте короче — например «H7» или «линзы»."}
            </p>
          ) : (
            <ul className="max-h-[calc(100dvh-6rem)] divide-y md:max-h-[70vh] divide-brand-100 overflow-y-auto">
              {results.map((entry, position) => (
                <li key={entry.s} role="option" aria-selected={position === active}>
                  <Link
                    href={`/product/${entry.s}/`}
                    onClick={close}
                    className={`flex items-center gap-3 px-3 py-2.5 ${
                      position === active ? "bg-brand-50" : "hover:bg-brand-50"
                    }`}
                  >
                    <span className="photo-bed flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                      {entry.i ? (
                        <img
                          src={entry.i}
                          alt=""
                          width={48}
                          height={48}
                          loading="lazy"
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <SearchIcon className="h-4 w-4 text-brand-300" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-brand-900">
                        {entry.t}
                      </span>
                      <span className="block truncate text-xs text-brand-400">
                        {entry.c}
                        {entry.a ? "" : " · нет в наличии"}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-sm font-semibold text-brand-900">
                      {entry.p > 0 ? formatPrice(entry.p, currencySymbol) : ""}
                    </span>
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={searchUrl}
                  onClick={close}
                  className="block px-3 py-3 text-center text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  {matches.length > results.length ? "Все результаты по разделам · Enter" : "Открыть страницу поиска · Enter"}
                </Link>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
