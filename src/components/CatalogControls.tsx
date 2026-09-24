"use client";

import { useMemo, useState } from "react";

import { pluralize } from "@/lib/format";

/**
 * Фильтры и сортировка каталога.
 *
 * Приём, на котором держится вся страница: карточки товаров приходят сюда
 * готовыми, отрендеренными на сервере, и лежат в children. Этот компонент
 * знает о них только цену, бренд и наличие — по паре десятков байт на товар.
 * Фильтрация прячет ненужные карточки, сортировка меняет им CSS-свойство
 * order.
 *
 * Зачем так: в HTML попадают все товары раздела — краулер видит полный
 * ассортимент без исполнения JavaScript. Если бы фильтры рендерили сетку
 * сами, в бандл пришлось бы тащить весь каталог (при 300+ товарах это
 * сотни килобайт), а поисковик увидел бы пустой div.
 *
 * Состояние фильтров сознательно не пишется в URL: /catalog/lampy/?brand=osram
 * плодил бы дубли страниц с одинаковым содержимым, и их пришлось бы закрывать
 * от индексации.
 */

export interface CatalogItem {
  /** Тот же порядок, что у children. */
  id: string;
  brand: string;
  price: number;
  inStock: boolean;
  /** Позиция в исходном порядке — для сортировки «по умолчанию». */
  order: number;
}

type SortKey = "default" | "price-asc" | "price-desc" | "name";

const SORT_LABELS: Record<SortKey, string> = {
  default: "По умолчанию",
  "price-asc": "Сначала дешевле",
  "price-desc": "Сначала дороже",
  name: "По названию",
};

interface CatalogControlsProps {
  items: CatalogItem[];
  titles: string[];
  children: React.ReactNode;
}

export function CatalogControls({
  items,
  titles,
  children,
}: CatalogControlsProps) {
  const [sort, setSort] = useState<SortKey>("default");

  const orderById = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      switch (sort) {
        case "price-asc":
          return a.price - b.price;
        case "price-desc":
          return b.price - a.price;
        case "name":
          return (titles[a.order] ?? "").localeCompare(titles[b.order] ?? "", "ru");
        default:
          return a.order - b.order;
      }
    });

    const order = new Map<string, number>();
    sorted.forEach((item, position) => order.set(item.id, position));
    return order;
  }, [items, titles, sort]);

  const cards = Array.isArray(children) ? children : [children];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-500">
          {pluralize(items.length, "товар", "товара", "товаров")}
        </p>
        <label className="flex items-center gap-2 text-sm text-brand-500">
          Сортировка:
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-sm font-medium text-brand-800 focus:border-brand-600 focus:outline-none"
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {items.map((item, position) => (
          <div
            key={item.id}
            style={{ order: orderById.get(item.id) ?? 999 }}
            className="flex"
          >
            {cards[position]}
          </div>
        ))}
      </div>
    </div>
  );
}
