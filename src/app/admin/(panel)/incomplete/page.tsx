import type { Metadata } from "next";
import Link from "next/link";

import { AiFaqBatch } from "@/components/admin/AiFaqBatch";
import { IncompleteFilters } from "@/components/admin/IncompleteFilters";
import { aiConfigured } from "@/lib/ai";
import { pickUrl } from "@/lib/image-types";
import { getImage } from "@/lib/images";
import { GAPS, isGap, listIncompleteProducts, SEO_GAPS, type Gap } from "@/lib/incomplete";
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

  const everything = listIncompleteProducts();
  const all = everything.filter((product) => !categoryId || product.categoryId === categoryId);
  const counts = Object.fromEntries(
    (Object.keys(GAPS) as Gap[]).map((key) => [
      key,
      all.filter((product) => product.gaps.includes(key)).length,
    ]),
  ) as Record<Gap, number>;
  const matching = gap ? all.filter((product) => product.gaps.includes(gap)) : all;
  const withGap = gap ? everything.filter((product) => product.gaps.includes(gap)) : everything;
  const perCategory = new Map<string, number>();
  for (const product of withGap) {
    perCategory.set(product.categoryId, (perCategory.get(product.categoryId) ?? 0) + 1);
  }
  const gapOption = (key: Gap) => ({ value: key, label: GAPS[key], count: counts[key] });
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
          Товары, у которых не хватает цены, описания, фото, вопросов-ответов, привязки к
          автомобилям в разделах с подбором по авто или привязки к типу рамки в переходных рамках,
          а также карточки с SEO-проблемами: неинформативный alt у фото, длинный title, слишком
          короткое или длинное мета-описание, нет бренда или артикула.
        </p>
      </div>

      <AiFaqBatch
        total={everything.filter((product) => product.gaps.includes("faq")).length}
        ready={aiConfigured()}
      />

      <IncompleteFilters
        gap={gap ?? ""}
        category={categoryId}
        total={all.length}
        categoryTotal={withGap.length}
        cardGaps={(Object.keys(GAPS) as Gap[])
          .filter((key) => !SEO_GAPS.includes(key))
          .map(gapOption)}
        seoGaps={SEO_GAPS.map(gapOption)}
        categories={categories
          .filter((category) => perCategory.has(category.id) || category.id === categoryId)
          .map((category) => ({
            value: category.id,
            label: category.name,
            count: perCategory.get(category.id) ?? 0,
          }))}
      />

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
                      <span
                        key={key}
                        className={`badge ${
                          SEO_GAPS.includes(key)
                            ? "bg-sky-100 text-sky-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {GAPS[key]}
                      </span>
                    ))}
                  </span>
                </Link>
                {product.twins.length > 0 && (
                  <p className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 pl-[4.75rem] text-xs text-brand-500">
                    Такое же название:
                    {product.twins.map((twin) => (
                      <Link
                        key={twin.id}
                        href={`/admin/products/${twin.id}/`}
                        className="font-medium text-brand-700 underline hover:text-brand-900"
                      >
                        {twin.sku || twin.id}
                      </Link>
                    ))}
                  </p>
                )}
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
