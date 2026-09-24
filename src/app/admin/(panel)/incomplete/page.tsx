import type { Metadata } from "next";
import Link from "next/link";

import { pickUrl } from "@/lib/image-types";
import { getImage } from "@/lib/images";
import { GAPS, isGap, listIncompleteProducts, type Gap } from "@/lib/incomplete";
import { listCategoriesBrief } from "@/lib/store";

export const metadata: Metadata = { title: "Незаполненные карточки" };

const PER_PAGE = 100;

interface PageProps {
  searchParams: Promise<{ gap?: string; category?: string; page?: string }>;
}

export default async function IncompletePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const gap: Gap | null = isGap(params.gap) ? params.gap : null;
  const categoryId = params.category ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  const categories = listCategoriesBrief();
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  const all = listIncompleteProducts().filter(
    (product) => !categoryId || product.categoryId === categoryId,
  );
  const counts = Object.fromEntries(
    (Object.keys(GAPS) as Gap[]).map((key) => [
      key,
      all.filter((product) => product.gaps.includes(key)).length,
    ]),
  ) as Record<Gap, number>;
  const matching = gap ? all.filter((product) => product.gaps.includes(gap)) : all;
  const pages = Math.max(1, Math.ceil(matching.length / PER_PAGE));
  const rows = matching.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { gap: gap ?? undefined, category: categoryId, page: undefined, ...patch };
    for (const [key, value] of Object.entries(merged)) {
      if (value && value !== "1") next.set(key, value);
    }
    const search = next.toString();
    return `/admin/incomplete/${search ? `?${search}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">
          Незаполненные карточки{" "}
          <span className="tnum text-base font-medium text-brand-400">{all.length}</span>
        </h1>
        <p className="mt-1 text-sm text-brand-500">
          Товары, у которых не хватает цены, описания, фото, вопросов-ответов или привязки к
          автомобилям в разделах с подбором по авто.
        </p>
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-4">
        <Link
          href={link({ gap: undefined })}
          className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
            gap === null ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-700"
          }`}
        >
          Все <span className="tnum">{all.length}</span>
        </Link>
        {(Object.keys(GAPS) as Gap[]).map((key) => (
          <Link
            key={key}
            href={link({ gap: key })}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
              gap === key ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-700"
            }`}
          >
            {GAPS[key]} <span className="tnum">{counts[key]}</span>
          </Link>
        ))}

        <form method="get" className="ml-auto flex items-center gap-2">
          {gap && <input type="hidden" name="gap" value={gap} />}
          <select
            name="category"
            defaultValue={categoryId}
            className="field py-1.5 text-sm"
            aria-label="Раздел"
          >
            <option value="">Все разделы</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary py-1.5 text-sm">
            Показать
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          Все карточки заполнены.
        </p>
      ) : (
        <ul className="card divide-y divide-brand-100">
          {rows.map((product) => {
            const thumb = pickUrl(getImage(product.image ?? undefined), 96);
            return (
              <li key={product.id}>
                <Link
                  href={`/admin/products/${product.id}/`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-brand-50"
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg bg-white object-contain"
                    />
                  ) : (
                    <span className="h-12 w-12 shrink-0 rounded-lg bg-brand-100" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-brand-900">
                      {product.title}
                    </span>
                    <span className="block truncate text-xs text-brand-400">
                      {categoryNames.get(product.categoryId) ?? product.categoryId}
                      {product.sku ? ` · ${product.sku}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {product.gaps.map((key) => (
                      <span key={key} className="badge bg-amber-100 text-amber-900">
                        {GAPS[key]}
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
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
