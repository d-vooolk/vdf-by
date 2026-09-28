import type { Metadata } from "next";
import Link from "next/link";

import { FrameTypeStockField } from "@/components/admin/FrameTypeStockField";
import { CopyIcon, PlusIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { getSite } from "@/lib/catalog";
import { buildFrameSku } from "@/lib/frame-sku";
import {
  defaultFrameCategory,
  frameCategories,
  initialFrameValues,
  listFrameTypes,
  type FrameTypeValues,
} from "@/lib/frame-types";

export const metadata: Metadata = { title: "Типы рамок" };

interface PageProps {
  searchParams: Promise<{ category?: string; q?: string; stock?: string }>;
}

export default async function FrameTypesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const categories = frameCategories();
  const categoryId =
    categories.find((category) => category.id === params.category)?.id ??
    defaultFrameCategory(categories);
  const query = (params.q ?? "").trim().toUpperCase().slice(0, 10);
  const site = getSite();
  const money = (value: number | null) =>
    value === null ? "—" : formatPrice(value, site.currencySymbol);
  const describe = (values: FrameTypeValues) =>
    [
      `себест. ${money(values.costPrice)}`,
      `цена ${money(values.price)}`,
      `опт ${money(values.wholesalePrice)}`,
    ].join(" · ");

  const groups = categoryId ? listFrameTypes(categoryId) : [];
  const stockFirst = params.stock === "1";
  const inStock = (group: (typeof groups)[number]) => (initialFrameValues(group).stockQty ?? 0) > 0;
  const found = query
    ? groups.filter(
        (group) => group.type.startsWith(query) || group.name.toUpperCase().includes(query),
      )
    : groups;
  const shown = stockFirst
    ? [...found.filter(inStock), ...found.filter((group) => !inStock(group))]
    : found;
  const stockCount = groups.filter(inStock).length;
  const categoryQuery = `?category=${encodeURIComponent(categoryId)}`;
  const toggleStockHref = `/admin/frame-types/${categoryQuery}${query ? `&q=${encodeURIComponent(query)}` : ""}${
    stockFirst ? "" : "&stock=1"
  }`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-brand-900">
            Типы рамок{" "}
            <span className="tnum text-base font-medium text-brand-400">{groups.length}</span>
          </h1>
          <p className="mt-1 text-sm text-brand-500">
            Артикул товара собирается как «номер-дополнение-тип»: номер свой у каждого товара,
            дополнение и тип общие. Себестоимость, цена, оптовая цена, остаток и наличие задаются
            для типа целиком и записываются во все товары с этим типом.
          </p>
        </div>
        {categoryId && (
          <Link href={`/admin/frame-types/new/${categoryQuery}`} className="btn-primary py-2 text-sm">
            <PlusIcon className="h-4 w-4" />
            Новый тип
          </Link>
        )}
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label htmlFor="q" className="label">
            Тип или название
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            maxLength={10}
            placeholder="110N"
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
              name="category"
              defaultValue={categoryId}
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
        {categories.length === 1 && <input type="hidden" name="category" value={categoryId} />}
        {stockFirst && <input type="hidden" name="stock" value="1" />}
        <button type="submit" className="btn-secondary py-2 text-sm">
          Найти
        </button>
        <Link
          href={toggleStockHref}
          aria-pressed={stockFirst}
          className={`${stockFirst ? "btn-primary" : "btn-secondary"} ml-auto py-2 text-sm`}
        >
          Сначала в наличии <span className="tnum opacity-70">{stockCount}</span>
        </Link>
      </form>

      {!categoryId ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          Нет раздела рамок: нужен раздел без подразделов с подбором по машинам и словом «рамки» в
          названии.
        </p>
      ) : shown.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          {groups.length ? "Такого типа нет." : "Типов пока нет — создайте первый."}
        </p>
      ) : (
        <ul className="card divide-y divide-brand-100">
          {shown.map((group) => (
            <li
              key={group.type}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-brand-50"
            >
              <Link
                href={`/admin/frame-types/${group.type}/${categoryQuery}`}
                className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1"
              >
                <span className="tnum w-16 text-base font-semibold text-brand-900">{group.type}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-brand-900">
                    {group.name || <span className="text-brand-400">без названия</span>}
                  </span>
                  <span className="block text-xs text-brand-500">
                    <span className="tnum">
                      {buildFrameSku({ number: "номер", suffix: group.suffix, type: group.type })}
                    </span>
                    {" · "}
                    {group.saved ? describe(group.saved) : "цены для типа не заданы"}
                  </span>
                </span>
                <span
                  className="tnum w-28 truncate text-sm text-brand-700"
                  title="Складской номер — виден только в админке"
                >
                  {group.storageCode ? (
                    <>склад: {group.storageCode}</>
                  ) : (
                    <span className="text-brand-400">
                      {group.storageMixed ? "склад: разный" : "склад: —"}
                    </span>
                  )}
                </span>
                <span className="tnum w-24 text-sm text-brand-500">
                  {group.products.length} {group.products.length === 1 ? "товар" : "товаров"}
                </span>
                {!group.uniform && (
                  <span className="badge bg-amber-100 text-amber-900">у товаров разные значения</span>
                )}
              </Link>
              <Link
                href={`/admin/frame-types/new/${categoryQuery}&from=${encodeURIComponent(group.type)}`}
                title="Копировать тип"
                aria-label={`Копировать тип ${group.type}`}
                className="btn-ghost p-2 text-brand-500 hover:text-brand-900"
              >
                <CopyIcon className="h-4 w-4" />
              </Link>
              <FrameTypeStockField
                categoryId={categoryId}
                type={group.type}
                initial={initialFrameValues(group).stockQty}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
