import Link from "next/link";

import { categoryUrl, getCategories } from "@/lib/catalog";
import { listCategoriesBrief } from "@/lib/store";

export const metadata = { title: "Разделы" };

/**
 * Разделы каталога.
 *
 * Порядок задаётся числом в карточке раздела, а не перетаскиванием: разделов
 * пять-шесть штук, меняют их раз в год, и ради этого тащить в админку
 * библиотеку drag-and-drop незачем.
 *
 * Список уже приходит в порядке дерева (родитель, следом его подразделы),
 * поэтому вложенность рисуется одним отступом по parentId — собирать
 * иерархию здесь не нужно.
 */
export default function CategoriesPage() {
  const brief = listCategoriesBrief();
  const full = new Map(getCategories().map((category) => [category.id, category]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-brand-900">
          Разделы{" "}
          <span className="tnum text-base font-medium text-brand-400">
            {brief.length}
          </span>
        </h1>
        <Link href="/admin/categories/new/" className="btn-primary py-2 text-sm">
          Добавить раздел
        </Link>
      </div>

      {brief.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          Разделов пока нет. Без них товар создать не получится — начните
          отсюда.
        </p>
      ) : (
        <div className="card divide-y divide-brand-100 overflow-hidden">
          {brief.map((category) => {
            const details = full.get(category.id);
            return (
              <div
                key={category.id}
                className={`flex items-center gap-3 py-3 pr-4 ${
                  category.parentId ? "bg-brand-50/40 pl-10" : "pl-4"
                }`}
              >
                <span className="tnum w-8 shrink-0 text-xs text-brand-300">
                  {details?.order ?? "—"}
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/categories/${category.id}/`}
                    className={`block truncate hover:text-brand-700 ${
                      category.parentId
                        ? "text-sm text-brand-700"
                        : "text-sm font-semibold text-brand-900"
                    }`}
                  >
                    {category.parentId && (
                      <span className="text-brand-300">└ </span>
                    )}
                    {category.name}
                  </Link>
                  <p className="truncate text-xs text-brand-400">
                    {details ? categoryUrl(details) : `/catalog/${category.slug}/`}
                    {category.carFitment ? " · подбор по авто" : ""}
                    {details?.excerpt ? ` · ${details.excerpt}` : ""}
                  </p>
                </div>

                {category.children > 0 ? (
                  // У раздела с подразделами своих товаров не бывает —
                  // показывать «0 тов.» было бы враньём про пустой раздел.
                  <span className="shrink-0 text-xs text-brand-400">
                    {category.children} подразд.
                  </span>
                ) : (
                  <Link
                    href={`/admin/products/?category=${category.id}`}
                    className="tnum shrink-0 text-sm text-brand-400 hover:text-brand-700"
                    title="Товары раздела"
                  >
                    {category.count} тов.
                  </Link>
                )}

                <Link
                  href={details ? categoryUrl(details) : `/catalog/${category.slug}/`}
                  target="_blank"
                  rel="noopener"
                  title="Посмотреть на сайте"
                  className="btn-ghost px-2 py-1 text-xs"
                >
                  ↗
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
