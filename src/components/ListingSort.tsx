"use client";

import { useRouter } from "next/navigation";

import { listingHref, SORT_LABELS, type SortKey } from "@/lib/listing";

export function ListingSort({ basePath, sort }: { basePath: string; sort: SortKey }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-brand-500">
      Сортировка:
      <select
        value={sort}
        onChange={(event) => router.push(listingHref(basePath, 1, event.target.value as SortKey))}
        className="rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-sm font-medium text-brand-800 focus:border-brand-600 focus:outline-none"
      >
        {Object.entries(SORT_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
