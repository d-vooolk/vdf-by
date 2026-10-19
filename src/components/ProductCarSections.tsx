import Link from "next/link";

import type { CarSections } from "@/lib/car-branch";
import { carName, years } from "@/lib/car-types";
import type { Category } from "@/lib/schema";

const THIS_YEAR = new Date().getFullYear();

export function ProductCarSections({
  category,
  categoryHref,
  groups,
}: {
  category: Category;
  categoryHref: string;
  groups: CarSections[];
}) {
  const allLabel = `Все ${category.name.toLowerCase()}`;

  return (
    <nav
      className="mt-14 border-t border-brand-100 pt-10"
      aria-label={groups.length ? "Что ещё есть для этой машины" : allLabel}
    >
      {groups.length > 0 && (
        <>
          <h2 className="mb-4 text-xl font-semibold text-brand-900 sm:text-2xl">
            Что ещё есть для этой машины
          </h2>
          <ul className="mb-5 space-y-3">
            {groups.map(({ car, related }) => {
              const name = carName(
                { name: car.markName },
                { name: car.modelName },
                { name: car.generationName },
              );
              const period = years(car, THIS_YEAR);
              return (
                <li key={car.generationId}>
                  <p className="mb-2 text-sm text-brand-500">
                    {name}
                    {period && <span className="text-brand-400"> · {period}</span>}
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {related.map((entry) => (
                      <li key={entry.category.id}>
                        <Link href={entry.url} className="card card-link block px-4 py-2.5">
                          <span className="text-sm font-semibold text-brand-900">
                            {entry.category.name} для {name}
                          </span>
                          <span className="ml-2 text-xs text-brand-400">{entry.count}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Link
        href={categoryHref}
        className="card card-link inline-block px-4 py-2.5 text-sm font-semibold text-brand-700"
      >
        {allLabel} — подбор по марке и модели
      </Link>
    </nav>
  );
}
