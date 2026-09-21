import Link from "next/link";

import {
  CARS_ROOT,
  generationUrl,
  years,
  type ProductCar,
} from "@/lib/car-types";

/**
 * «Подходит к автомобилям» на странице товара.
 *
 * Покупателю это ответ на главный вопрос — встанет или нет. Поисковику —
 * внутренние ссылки на страницы подбора: страница, на которую ведёт только
 * sitemap, обходится редко и ранжируется плохо, а сюда ссылка приходит с
 * каждого подходящего товара.
 *
 * Машины сгруппированы по модели: у товара, подходящего ко всем
 * рестайлингам Golf, иначе получился бы список из восьми почти одинаковых
 * строк подряд.
 */

const THIS_YEAR = new Date().getFullYear();

interface Group {
  key: string;
  markSlug: string;
  markName: string;
  modelSlug: string;
  modelName: string;
  generations: ProductCar[];
}

export function ProductCars({
  cars,
  base = CARS_ROOT,
}: {
  cars: ProductCar[];
  base?: string;
}) {
  if (!cars.length) return null;

  const groups: Group[] = [];
  for (const car of cars) {
    const key = `${car.markSlug}/${car.modelSlug}`;
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = {
        key,
        markSlug: car.markSlug,
        markName: car.markName,
        modelSlug: car.modelSlug,
        modelName: car.modelName,
        generations: [],
      };
      groups.push(group);
    }
    group.generations.push(car);
  }

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-brand-900">
        Подходит к автомобилям
      </h2>

      <ul className="card divide-y divide-brand-100 overflow-hidden">
        {groups.map((group) => (
          <li key={group.key} className="px-4 py-3">
            <p className="text-sm font-semibold text-brand-900">
              {group.markName} {group.modelName}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {group.generations.map((car) => {
                const period = years(car, THIS_YEAR);
                return (
                  <li key={car.generationId}>
                    <Link
                      href={generationUrl(
                        car.markSlug,
                        car.modelSlug,
                        car.generationSlug,
                        base,
                      )}
                      className="inline-flex items-baseline gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1 text-xs text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
                    >
                      <span className="font-medium">{car.generationName}</span>
                      {period && (
                        <span className="text-brand-400">{period}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <p className="mt-2.5 text-xs text-brand-400">
        Не нашли свою машину в списке — позвоните, проверим по VIN.
      </p>
    </section>
  );
}
