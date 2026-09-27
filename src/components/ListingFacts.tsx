import Link from "next/link";

import { summarize, summaryLines } from "@/lib/listing-summary";
import type { Product } from "@/lib/schema";
import { hasAnyInStock } from "@/lib/variant";

export function ListingFacts({
  title,
  products,
  currencySymbol,
  intro,
}: {
  title: string;
  products: Product[];
  currencySymbol: string;
  intro?: string;
}) {
  if (!products.length) return null;

  const lines = summaryLines(summarize(products), currencySymbol);
  const popular = products.filter(hasAnyInStock).slice(0, 3);

  return (
    <section className="prose-shop mt-14 max-w-3xl border-t border-brand-100 pt-10">
      <h2 className="mb-3 text-xl font-semibold text-brand-900">{title}</h2>
      {intro && <p>{intro}</p>}
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        {lines.map((line) => (
          <li key={line}>{line}.</li>
        ))}
        {popular.length > 0 && (
          <li>
            В наличии, например:{" "}
            {popular.map((product, index) => (
              <span key={product.id}>
                {index > 0 && ", "}
                <Link
                  href={`/product/${product.slug}/`}
                  className="font-medium text-brand-900 underline decoration-accent-400 decoration-2 underline-offset-4 hover:decoration-accent-600"
                >
                  {product.title}
                </Link>
              </span>
            ))}
            .
          </li>
        )}
      </ul>
    </section>
  );
}
