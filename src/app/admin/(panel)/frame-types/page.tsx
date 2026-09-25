import type { Metadata } from "next";
import Link from "next/link";

import { formatPrice } from "@/lib/format";
import { getSite } from "@/lib/catalog";
import {
  defaultFrameCategory,
  frameCategories,
  listFrameTypes,
  type FrameTypeValues,
} from "@/lib/frame-types";

export const metadata: Metadata = { title: "Типы рамок" };

interface PageProps {
  searchParams: Promise<{ category?: string; q?: string }>;
}

export default async function FrameTypesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const categories = frameCategories();
  const categoryId =
    categories.find((category) => category.id === params.category)?.id ??
    defaultFrameCategory(categories);
  const query = (params.q ?? "").replace(/\D/g, "").slice(0, 3);
  const site = getSite();
  const money = (value: number | null) =>
    value === null ? "—" : formatPrice(value, site.currencySymbol);
  const describe = (values: FrameTypeValues) =>
    [
      `себест. ${money(values.costPrice)}`,
      `цена ${money(values.price)}`,
      `опт ${money(values.wholesalePrice)}`,
      `остаток ${values.stockQty ?? "—"}`,
      values.inStock ? "в наличии" : "нет в наличии",
    ].join(" · ");

  const groups = categoryId ? listFrameTypes(categoryId) : [];
  const shown = query ? groups.filter((group) => group.type.startsWith(query)) : groups;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">
          Типы рамок <span className="tnum text-base font-medium text-brand-400">{groups.length}</span>
        </h1>
        <p className="mt-1 text-sm text-brand-500">
          Тип — три последние цифры артикула. Себестоимость, цена, оптовая цена, остаток и наличие
          задаются для типа целиком и записываются во все товары с этим типом.
        </p>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label htmlFor="q" className="label">
            Тип рамки
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            inputMode="numeric"
            maxLength={3}
            placeholder="001"
            className="field tnum w-28 py-2 text-sm"
          />
        </div>
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
        <button type="submit" className="btn-secondary py-2 text-sm">
          Найти
        </button>
      </form>

      {shown.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          {groups.length ? "Такого типа нет." : "В разделе нет товаров с типом в артикуле."}
        </p>
      ) : (
        <ul className="card divide-y divide-brand-100">
          {shown.map((group) => (
            <li key={group.type}>
              <Link
                href={`/admin/frame-types/${group.type}/?category=${encodeURIComponent(categoryId)}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-brand-50"
              >
                <span className="tnum w-12 text-base font-semibold text-brand-900">{group.type}</span>
                <span className="tnum w-24 text-sm text-brand-500">
                  {group.products.length} {group.products.length === 1 ? "товар" : "товаров"}
                </span>
                <span className="min-w-0 flex-1 text-xs text-brand-500">
                  {group.saved ? describe(group.saved) : "значения для типа не заданы"}
                </span>
                {!group.uniform && (
                  <span className="badge bg-amber-100 text-amber-900">у товаров разные значения</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
