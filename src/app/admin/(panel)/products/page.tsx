import { cookies } from "next/headers";
import Link from "next/link";

import { ProductsTable } from "@/components/admin/ProductsTable";
import { ProductsViewSwitch } from "@/components/admin/ProductsViewSwitch";
import { parseProductsView, PRODUCTS_VIEW_COOKIE } from "@/lib/admin-prefs";
import { getSite } from "@/lib/catalog";
import { frameLockedIds } from "@/lib/frame-membership";
import { pickUrl } from "@/lib/image-types";
import { getImage } from "@/lib/images";
import { listCategoriesBrief, listProducts } from "@/lib/store";

/** Список товаров с поиском, фильтром по разделу и постраничной листалкой. */

export const metadata = { title: "Товары" };

const PER_PAGE = 40;

interface PageProps {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>;
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const view = parseProductsView((await cookies()).get(PRODUCTS_VIEW_COOKIE)?.value);
  const page = Math.max(1, Number(params.page) || 1);
  const categoryId = params.category ?? "";
  const query = params.q ?? "";

  const categories = listCategoriesBrief();
  const { rows, total } = listProducts({
    categoryId: categoryId || undefined,
    query,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  });

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  // Обычные объекты, а не Map: всё это уезжает пропсами в клиентский
  // компонент, а Map через границу сервер→клиент не сериализуется.
  const categoryNames = Object.fromEntries(
    categories.map((category) => [category.id, category.name]),
  );
  // Манифест картинок клиенту целиком не отдаём — он большой из-за размытых
  // заглушек. Достаём по одной готовой ссылке на миниатюру.
  const thumbs = Object.fromEntries(
    rows.map((product) => [
      product.id,
      pickUrl(getImage(product.image ?? undefined), 96),
    ]),
  );

  /** Ссылка с сохранением остальных фильтров. */
  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { category: categoryId, q: query, page: String(page), ...patch };
    for (const [key, value] of Object.entries(merged)) {
      if (value && value !== "1") next.set(key, value);
    }
    const search = next.toString();
    return `/admin/products/${search ? `?${search}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-brand-900">
          Товары{" "}
          <span className="tnum text-base font-medium text-brand-400">
            {total}
          </span>
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <ProductsViewSwitch view={view} />
          <Link href="/admin/products/new/" className="btn-primary py-2 text-sm">
            Добавить товар
          </Link>
        </div>
      </div>

      {/* --------------------------- Фильтры --------------------------- */}
      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="w-full sm:w-auto sm:min-w-64 sm:flex-1">
          <label htmlFor="q" className="label">
            Поиск
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Название, бренд, код или адрес"
            className="field py-2 text-sm"
          />
        </div>

        <div className="min-w-0 flex-1 sm:flex-none">
          <label htmlFor="category" className="label">
            Раздел
          </label>
          <select
            id="category"
            name="category"
            defaultValue={categoryId}
            className="field w-full py-2 text-sm sm:w-auto sm:max-w-72"
          >
            <option value="">Все категории</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} ({category.count})
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn-secondary py-2 text-sm">
          Показать
        </button>
        {(query || categoryId) && (
          <Link href="/admin/products/" className="btn-ghost py-2 text-sm">
            Сбросить
          </Link>
        )}
      </form>

      {/* --------------------------- Таблица --------------------------- */}
      {rows.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          {query || categoryId
            ? "Ничего не нашлось. Попробуйте изменить запрос."
            : "Товаров пока нет. Начните с кнопки «Добавить товар»."}
        </p>
      ) : (
        <ProductsTable
          rows={rows}
          categoryNames={categoryNames}
          thumbs={thumbs}
          view={view}
          currencySymbol={getSite().currencySymbol}
          frameLocked={frameLockedIds(rows)}
        />
      )}

      {/* -------------------------- Страницы --------------------------- */}
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
