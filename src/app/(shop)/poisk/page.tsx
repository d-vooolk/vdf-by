import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CarProducts } from "@/components/CarProducts";
import { SearchIcon } from "@/components/icons";
import { groupByCategory } from "@/lib/cars";
import { categoryTrail, categoryUrl, getProductBySlug, getRootCategories, getSite } from "@/lib/catalog";
import { pluralize } from "@/lib/format";
import type { Product } from "@/lib/schema";
import { searchProducts } from "@/lib/search";
import { buildSearchIndex } from "@/lib/search-index";

interface PageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

function queryOf(value: string | string[] | undefined): string {
  const text = Array.isArray(value) ? value[0] : value;
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const query = queryOf((await searchParams).q);
  return {
    title: query ? `Поиск: ${query}` : "Поиск по каталогу",
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const query = queryOf((await searchParams).q);
  const site = getSite();
  const found = query.length >= 2
    ? searchProducts(buildSearchIndex(), query, Infinity)
        .map((entry) => getProductBySlug(entry.s))
        .filter((product): product is Product => Boolean(product))
    : [];
  const groups = groupByCategory(found);

  return (
    <div className="container-page">
      <Breadcrumbs items={[{ label: "Поиск" }]} />

      <h1 className="text-3xl font-semibold text-brand-900">
        {query ? <>Поиск: «{query}»</> : "Поиск по каталогу"}
      </h1>

      <form action="/poisk/" role="search" className="relative mt-5 max-w-2xl">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-brand-300" />
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Линзы, лампы H7, стекло Golf…"
          className="field py-2.5 pr-28 pl-11"
          aria-label="Что ищем"
        />
        <button type="submit" className="btn-primary absolute top-1/2 right-1.5 -translate-y-1/2 px-4 py-1.5 text-sm">
          Найти
        </button>
      </form>

      {query.length >= 2 && (
        <p className="mt-4 text-sm text-brand-500">
          {found.length
            ? `Нашли ${pluralize(found.length, "товар", "товара", "товаров")} в ${pluralize(groups.length, "разделе", "разделах", "разделах")}`
            : "Ничего не нашли. Попробуйте короче или другими словами — например «H7», «линзы» или марку машины."}
        </p>
      )}

      {groups.length > 1 && (
        <nav aria-label="Разделы с найденными товарами" className="mt-4 flex flex-wrap gap-2">
          {groups.map((group) => (
            <a
              key={group.category.id}
              href={`#razdel-${group.category.id}`}
              className="rounded-full border border-brand-100 px-3 py-1 text-sm text-brand-600 hover:border-brand-300 hover:text-brand-900"
            >
              {group.category.name} <span className="text-brand-400">{group.products.length}</span>
            </a>
          ))}
        </nav>
      )}

      {groups.length > 0 && (
        <div className="mt-10">
          <CarProducts
            groups={groups}
            currencySymbol={site.currencySymbol}
            anchorPrefix="razdel-"
            trailFor={(group) =>
              categoryTrail(group.category).map((category) => ({
                label: category.name,
                href: categoryUrl(category),
              }))
            }
          />
        </div>
      )}

      {!found.length && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-semibold text-brand-900">Разделы каталога</h2>
          <ul className="flex flex-wrap gap-2">
            {getRootCategories().map((category) => (
              <li key={category.id}>
                <Link
                  href={categoryUrl(category)}
                  className="rounded-full border border-brand-100 px-3 py-1.5 text-sm text-brand-700 hover:border-brand-300"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
