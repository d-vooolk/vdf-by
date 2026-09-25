import Link from "next/link";

import { ProductsTable } from "@/components/admin/ProductsTable";
import { getSite } from "@/lib/catalog";
import { pickUrl } from "@/lib/image-types";
import { getImage } from "@/lib/images";
import { listCategoriesBrief, listProducts } from "@/lib/store";

export const metadata = { title: "Нет в наличии" };

const PER_PAGE = 40;

interface PageProps {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>;
}

export default async function OutOfStockPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const categoryId = params.category ?? "";
  const query = params.q ?? "";

  const site = getSite();
  const categories = listCategoriesBrief();
  const { rows, total } = listProducts({
    categoryId: categoryId || undefined,
    query,
    outOfStock: true,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  });

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const categoryNames = Object.fromEntries(
    categories.map((category) => [category.id, category.name]),
  );
  const thumbs = Object.fromEntries(
    rows.map((product) => [product.id, pickUrl(getImage(product.image ?? undefined), 96)]),
  );

  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { category: categoryId, q: query, page: String(page), ...patch };
    for (const [key, value] of Object.entries(merged)) {
      if (value && value !== "1") next.set(key, value);
    }
    const search = next.toString();
    return `/admin/out-of-stock/${search ? `?${search}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">
          Нет в наличии{" "}
          <span className="tnum text-base font-medium text-brand-400">{total}</span>
        </h1>
        <p className="mt-1 text-sm text-brand-500">
          Товары с пустым или нулевым остатком. Впишите остаток прямо в строке — товар сразу
          появится в наличии на сайте и уйдёт из этого списка после обновления страницы.
        </p>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="q" className="label">
            Поиск
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Название, бренд, артикул или адрес"
            className="field py-2 text-sm"
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
            <option value="">Все разделы</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn-secondary py-2 text-sm">
          Показать
        </button>
        {(query || categoryId) && (
          <Link href="/admin/out-of-stock/" className="btn-ghost py-2 text-sm">
            Сбросить
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          {query || categoryId ? "Ничего не нашлось." : "Все товары в наличии."}
        </p>
      ) : (
        <ProductsTable
          rows={rows}
          categoryNames={categoryNames}
          thumbs={thumbs}
          currencySymbol={site.currencySymbol}
        />
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="Страницы">
          {page > 1 && (
            <Link href={link({ page: String(page - 1) })} className="btn-secondary py-2 text-sm">
              ← Назад
            </Link>
          )}
          <span className="tnum text-sm text-brand-400">
            {page} из {pages}
          </span>
          {page < pages && (
            <Link href={link({ page: String(page + 1) })} className="btn-secondary py-2 text-sm">
              Вперёд →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
