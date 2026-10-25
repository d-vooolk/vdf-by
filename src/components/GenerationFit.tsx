import Link from "next/link";

import { carName, generationUrl, modelUrl, years } from "@/lib/car-types";
import { getProductCars } from "@/lib/cars";
import type { Category, Product } from "@/lib/schema";

const THIS_YEAR = new Date().getFullYear();
const MAX_PRODUCTS = 4;

interface GenerationFitProps {
  category: Category;
  base: string;
  noun: string;
  mark: { slug: string; name: string };
  model: { slug: string; name: string };
  generation: { id: string; name: string };
  products: Product[];
  hasModelText: boolean;
}

export function GenerationFit({
  category,
  base,
  noun,
  mark,
  model,
  generation,
  products,
  hasModelText,
}: GenerationFitProps) {
  if (!products.length) return null;
  const title = carName(mark, model, generation);
  const modelTitle = carName(mark, model);

  return (
    <section className="mt-12 max-w-3xl">
      <h2 className="mb-3 text-lg font-semibold text-brand-900">
        Какое {noun} подходит к {title}
      </h2>
      <ul className="space-y-3 text-base text-brand-600">
        {products.slice(0, MAX_PRODUCTS).map((product) => {
          const others = getProductCars(product.id).filter((car) => car.generationId !== generation.id);
          return (
            <li key={product.id}>
              <Link
                href={`/product/${product.slug}/`}
                className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-700"
              >
                {product.title}
              </Link>
              {others.length === 0 ? (
                <> — только для этого поколения.</>
              ) : (
                <>
                  {" "}— это же {noun} ставится на{" "}
                  {others.map((car, index) => {
                    const period = years(car, THIS_YEAR);
                    return (
                      <span key={car.generationId}>
                        {index > 0 && (index === others.length - 1 ? " и " : ", ")}
                        <Link
                          href={generationUrl(car.markSlug, car.modelSlug, car.generationSlug, base)}
                          className="text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-700"
                        >
                          {carName({ name: car.markName }, { name: car.modelName }, { name: car.generationName })}
                        </Link>
                        {period && ` (${period})`}
                      </span>
                    );
                  })}
                  .
                </>
              )}
            </li>
          );
        })}
      </ul>
      {hasModelText && (
        <p className="mt-4 text-sm text-brand-500">
          Чем отличаются {category.name.toLowerCase()} разных поколений {modelTitle} и как сверить свою
          фару —{" "}
          <Link
            href={modelUrl(mark.slug, model.slug, base)}
            className="text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-700"
          >
            на странице {modelTitle}
          </Link>
          .
        </p>
      )}
    </section>
  );
}
