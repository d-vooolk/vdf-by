import Link from "next/link";

import { ListingSort } from "@/components/ListingSort";
import { ProductCard } from "@/components/ProductCard";
import { pluralize } from "@/lib/format";
import { listingHref, type SortKey } from "@/lib/listing";
import type { Product } from "@/lib/schema";

interface ProductListingProps {
  items: Product[];
  total: number;
  page: number;
  pages: number;
  sort: SortKey;
  basePath: string;
  currencySymbol: string;
}

function pageNumbers(page: number, pages: number): Array<number | null> {
  const wanted = new Set([1, pages, page - 1, page, page + 1]);
  const list = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const result: Array<number | null> = [];
  for (const [index, n] of list.entries()) {
    if (index > 0 && n - list[index - 1] > 1) result.push(null);
    result.push(n);
  }
  return result;
}

export function ProductListing({
  items,
  total,
  page,
  pages,
  sort,
  basePath,
  currencySymbol,
}: ProductListingProps) {
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-500">
          {pluralize(total, "товар", "товара", "товаров")}
          {pages > 1 && ` · страница ${page} из ${pages}`}
        </p>
        <ListingSort basePath={basePath} sort={sort} />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
        {items.map((product, position) => (
          <div key={product.id} className="flex">
            <ProductCard
              product={product}
              currencySymbol={currencySymbol}
              priority={page === 1 && position < 3}
            />
          </div>
        ))}
      </div>

      {pages > 1 && (
        <nav
          className="mt-8 flex flex-wrap items-center justify-center gap-1.5"
          aria-label="Страницы каталога"
        >
          {page > 1 && (
            <Link
              href={listingHref(basePath, page - 1, sort)}
              rel="prev"
              className="btn-secondary px-3 py-2 text-sm"
            >
              ← Назад
            </Link>
          )}
          {pageNumbers(page, pages).map((n, index) =>
            n === null ? (
              <span key={`gap-${index}`} className="px-1 text-brand-300">
                …
              </span>
            ) : (
              <Link
                key={n}
                href={listingHref(basePath, n, sort)}
                aria-current={n === page ? "page" : undefined}
                className={`tnum min-w-10 rounded-xl px-3 py-2 text-center text-sm font-medium ${
                  n === page ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-700 hover:bg-brand-100"
                }`}
              >
                {n}
              </Link>
            ),
          )}
          {page < pages && (
            <Link
              href={listingHref(basePath, page + 1, sort)}
              rel="next"
              className="btn-secondary px-3 py-2 text-sm"
            >
              Вперёд →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
