import Link from "next/link";

import { ProductCard } from "@/components/ProductCard";
import type { CarCategoryGroup } from "@/lib/cars";
import { pluralize } from "@/lib/format";

interface CarProductsProps {
  groups: CarCategoryGroup[];
  currencySymbol: string;
  linkFor?: (group: CarCategoryGroup) => string;
}

export function CarProducts({
  groups,
  currencySymbol,
  linkFor,
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
        const href = linkFor?.(group);

        return (
          <section key={group.category.id}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-xl font-semibold text-brand-900">
                {href ? (
                  <Link href={href} className="hover:text-brand-600">
                    {group.category.name}
                  </Link>
                ) : (
                  group.category.name
                )}
              </h2>
              <p className="text-sm text-brand-400">
                {pluralize(
                  group.products.length,
                  "позиция",
                  "позиции",
                  "позиций",
                )}
                {href && (
                  <>
                    {" · "}
                    <Link
                      href={href}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      весь раздел под эту машину
                    </Link>
                  </>
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
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
