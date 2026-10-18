"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useId, useMemo, useState } from "react";

import type { PickerMark } from "@/components/CarPicker";
import { SearchIcon, SpinnerIcon } from "@/components/icons";
import { generationUrl, markUrl, modelUrl } from "@/lib/car-types";

interface Entry {
  label: string;
  hint: string;
  href: string;
  haystack: string;
  rank: number;
}

const RESULTS_LIMIT = 12;

const requests = new Map<string, Promise<PickerMark[]>>();

function loadTree(categorySlug: string): Promise<PickerMark[]> {
  const cached = requests.get(categorySlug);
  if (cached) return cached;
  const request = fetch(`/car-tree/${encodeURIComponent(categorySlug)}/`)
    .then((response) => (response.ok ? (response.json() as Promise<PickerMark[]>) : []))
    .catch(() => {
      requests.delete(categorySlug);
      return [];
    });
  requests.set(categorySlug, request);
  return request;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function entriesOf(tree: PickerMark[], base: string): Entry[] {
  return tree.flatMap((mark) => [
    { label: mark.n, hint: "все модели", href: markUrl(mark.s, base), haystack: normalize(mark.n), rank: 0 },
    ...mark.m.flatMap((model) => {
      const modelName = `${mark.n} ${model.n}`;
      return [
        {
          label: modelName,
          hint: "все поколения",
          href: modelUrl(mark.s, model.s, base),
          haystack: normalize(modelName),
          rank: 1,
        },
        ...model.g.map((generation) => ({
          label: `${modelName} ${generation.n}`,
          hint: generation.y,
          href: generationUrl(mark.s, model.s, generation.s, base),
          haystack: normalize(`${modelName} ${generation.n} ${generation.y}`),
          rank: 2,
        })),
      ];
    }),
  ]);
}

export function CategoryCarSearch({
  categorySlug,
  base,
  placeholder,
}: {
  categorySlug: string;
  base: string;
  placeholder: string;
}) {
  const router = useRouter();
  const listId = useId();
  const [tree, setTree] = useState<PickerMark[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const deferredQuery = useDeferredValue(query);

  const prefetch = () => {
    if (tree || loading) return;
    setLoading(true);
    void loadTree(categorySlug).then((loaded) => {
      setTree(loaded);
      setLoading(false);
    });
  };

  const entries = useMemo(() => (tree ? entriesOf(tree, base) : []), [tree, base]);

  const results = useMemo(() => {
    const words = normalize(deferredQuery).split(" ").filter(Boolean);
    if (!words.length) return [];
    return entries
      .filter((entry) => words.every((word) => entry.haystack.includes(word)))
      .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, "ru"))
      .slice(0, RESULTS_LIMIT);
  }, [entries, deferredQuery]);

  const showList = open && query.trim().length > 0;
  const active = results[Math.min(highlighted, results.length - 1)];

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        if (active) router.push(active.href);
      }}
      className="relative max-w-xl"
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        {placeholder}
      </label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-brand-400" />
      <input
        id={`${listId}-input`}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlighted(0);
          setOpen(true);
          prefetch();
        }}
        onFocus={() => {
          prefetch();
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (!results.length) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlighted((index) => (index + 1) % results.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlighted((index) => (index - 1 + results.length) % results.length);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${listId}-list`}
        aria-autocomplete="list"
        className="field py-3 pr-11 pl-12"
      />
      {loading && (
        <SpinnerIcon className="absolute top-1/2 right-4 h-5 w-5 -translate-y-1/2 animate-spin text-brand-400" />
      )}
      {showList && (
        <ul
          id={`${listId}-list`}
          role="listbox"
          className="card absolute inset-x-0 top-full z-30 mt-2 max-h-96 overflow-y-auto p-1.5 shadow-pop"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-brand-500">
              {loading || !tree ? "Загружаем список машин…" : "Такой машины в этом разделе нет"}
            </li>
          ) : (
            results.map((entry, index) => (
              <li key={entry.href} role="option" aria-selected={entry === active}>
                <Link
                  href={entry.href}
                  onMouseEnter={() => setHighlighted(index)}
                  className={`flex items-baseline justify-between gap-3 rounded-lg px-3 py-2.5 text-sm ${
                    entry === active ? "bg-brand-100 text-brand-900" : "text-brand-800"
                  }`}
                >
                  <span className="min-w-0 font-medium">{entry.label}</span>
                  <span className="tnum shrink-0 text-xs text-brand-500">{entry.hint}</span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </form>
  );
}
