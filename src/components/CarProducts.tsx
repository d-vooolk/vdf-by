import Link from "next/link";

import { ProductCard } from "@/components/ProductCard";
import type { CarCategoryGroup } from "@/lib/cars";

export interface CarGroupCrumb {
  label: string;
  href: string;
}

interface CarProductsProps {
  groups: CarCategoryGroup[];
  currencySymbol: string;
  trailFor?: (group: CarCategoryGroup) => CarGroupCrumb[];
}

export function CarProducts({
  groups,
  currencySymbol,
  trailFor,
}: CarProductsProps) {
  if (!groups.length) return null;

  const position = new Map(
    groups
      .flatMap((group) => group.products)
      .map((product, index) => [product.id, index] as const),
  );

  return (
    <div className="space-y-12">
      {groups.map((group) => {
        const trail = trailFor?.(group) ?? [];

        return (
          <section key={group.category.id}>
            <h2 className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xl font-semibold text-brand-900">
              {trail.length ? (
                trail.map((crumb, index) => (
                  <span key={crumb.href} className="flex items-baseline gap-x-2">
                    {index > 0 && (
                      <span aria-hidden="true" className="font-normal text-brand-300">
                        /
                      </span>
                    )}
                    <Link
                      href={crumb.href}
                      className={
                        index === 0
                          ? "hover:text-brand-600"
                          : "font-medium text-brand-600 hover:text-brand-900"
                      }
                    >
                      {crumb.label}
                    </Link>
                  </span>
                ))
              ) : (
                <span>{group.category.name}</span>
              )}
              <span className="tnum text-base font-normal text-brand-400">
                ({group.products.length})
              </span>
            </h2>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {group.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  currencySymbol={currencySymbol}
                  priority={(position.get(product.id) ?? 99) < 3}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
