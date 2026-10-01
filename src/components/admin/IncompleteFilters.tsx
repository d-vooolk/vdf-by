"use client";

import { useRouter } from "next/navigation";

interface FilterOption {
  value: string;
  label: string;
  count: number;
}

interface IncompleteFiltersProps {
  gap: string;
  category: string;
  total: number;
  categoryTotal: number;
  cardGaps: FilterOption[];
  seoGaps: FilterOption[];
  categories: FilterOption[];
}

function filterUrl(gap: string, category: string): string {
  const params = new URLSearchParams();
  if (gap) params.set("gap", gap);
  if (category) params.set("category", category);
  const search = params.toString();
  return `/admin/incomplete/${search ? `?${search}` : ""}`;
}

function optionLabel(option: FilterOption): string {
  return `${option.label} — ${option.count}`;
}

export function IncompleteFilters({
  gap,
  category,
  total,
  categoryTotal,
  cardGaps,
  seoGaps,
  categories,
}: IncompleteFiltersProps) {
  const router = useRouter();

  return (
    <div className="card grid gap-3 p-4 sm:grid-cols-2">
      <label className="block">
        <span className="label">Чего не хватает</span>
        <select
          value={gap}
          onChange={(event) => router.push(filterUrl(event.target.value, category))}
          className="field py-2 text-sm"
        >
          <option value="">{`Все незаполненные — ${total}`}</option>
          <optgroup label="Карточка">
            {cardGaps.map((option) => (
              <option key={option.value} value={option.value}>
                {optionLabel(option)}
              </option>
            ))}
          </optgroup>
          <optgroup label="SEO">
            {seoGaps.map((option) => (
              <option key={option.value} value={option.value}>
                {optionLabel(option)}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      <label className="block">
        <span className="label">Категория</span>
        <select
          value={category}
          onChange={(event) => router.push(filterUrl(gap, event.target.value))}
          className="field py-2 text-sm"
        >
          <option value="">{`Все категории — ${categoryTotal}`}</option>
          {categories.map((option) => (
            <option key={option.value} value={option.value}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
