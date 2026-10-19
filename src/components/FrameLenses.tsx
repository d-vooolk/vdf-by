import Link from "next/link";

import { ProductCard } from "@/components/ProductCard";
import type { FrameLenses as FrameLensesData } from "@/lib/frame-lenses";
import { pluralize } from "@/lib/format";

export function FrameLenses({
  lenses,
  title,
  currencySymbol,
  several = false,
}: {
  lenses: FrameLensesData | null;
  title: string;
  currencySymbol: string;
  several?: boolean;
}) {
  if (!lenses) return null;

  return (
    <section className="mt-14 border-t border-brand-100 pt-10">
      <h2 className="mb-2 text-xl font-semibold text-brand-900 sm:text-2xl">{title}</h2>
      <p className="mb-6 max-w-3xl text-sm text-brand-600">
        {several ? "Рамки рассчитаны" : "Рамка рассчитана"} на би-LED модули {lenses.collection.label} с креплением Hella 3R.
        Линзы в комплект {several ? "рамок" : "рамки"} не входят — популярные модели:
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {lenses.products.map((product) => (
          <ProductCard key={product.id} product={product} currencySymbol={currencySymbol} />
        ))}
      </div>
      <ul className="mt-5 flex flex-wrap gap-2">
        <li>
          <Link href={lenses.collectionHref} className="card card-link block px-4 py-2.5 text-sm">
            <span className="font-semibold text-brand-900">{lenses.collection.name}</span>
            <span className="ml-2 text-xs text-brand-400">
              {pluralize(lenses.collectionCount, "модель", "модели", "моделей")}
            </span>
          </Link>
        </li>
        <li>
          <Link
            href={lenses.categoryHref}
            className="card card-link block px-4 py-2.5 text-sm font-semibold text-brand-700"
          >
            Все би-LED модули и линзы
          </Link>
        </li>
      </ul>
    </section>
  );
}
