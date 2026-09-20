import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { MarkGrid } from "@/components/CarTiles";
import { getCarTree } from "@/lib/cars";
import { getSite } from "@/lib/catalog";
import { pluralize } from "@/lib/format";
import { buildMetadata } from "@/lib/seo";

/**
 * Подбор по автомобилю — корень раздела.
 *
 * Здесь только те марки, к которым привязан хотя бы один товар. Показывать
 * все четыреста из справочника нельзя: каждая вела бы на пустую страницу,
 * а пустые страницы в индексе тянут вниз соседние — и сами не ранжируются.
 */

export function generateMetadata(): Metadata {
  const marks = getCarTree();
  const site = getSite();

  return buildMetadata({
    title: "Подбор автосвета по марке и модели автомобиля",
    description: marks.length
      ? `Линзы, стёкла фар и лампы под конкретную машину: ${marks
          .slice(0, 8)
          .map((mark) => mark.name)
          .join(", ")} и другие. Выберите марку, модель и поколение — покажем, что подходит.`
      : `Подбор автосвета под вашу машину. ${site.name} — доставка по Минску и Беларуси.`,
    path: "/podbor/",
    // Пока ни к одной машине ничего не привязано, странице нечего
    // показывать, и в индексе ей не место.
    noIndex: marks.length === 0,
  });
}

export default function CarsPage() {
  const marks = getCarTree();
  const site = getSite();

  return (
    <div className="container-page pb-16">
      <Breadcrumbs items={[{ label: "Подбор по автомобилю" }]} />

      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">
          Подбор автосвета по автомобилю
        </h1>
        <p className="mt-2.5 max-w-2xl text-base text-brand-500">
          {marks.length > 0
            ? `Выберите марку, затем модель и поколение — покажем линзы, стёкла и лампы, которые подходят именно к вашей машине. Сейчас в подборе ${pluralize(marks.length, "марка", "марки", "марок")}.`
            : "Подбор по автомобилю пока наполняется. Позвоните — подскажем по модели или по VIN."}
        </p>
      </header>

      {marks.length > 0 ? (
        <nav aria-label="Марки автомобилей">
          <MarkGrid marks={marks} priorityCount={6} />
        </nav>
      ) : (
        <p className="card p-10 text-center text-sm text-brand-400">
          Ни один товар пока не привязан к автомобилю.{" "}
          <Link href="/catalog/" className="font-medium text-brand-700">
            Откройте каталог
          </Link>{" "}
          — там весь ассортимент.
        </p>
      )}

      <section className="prose-shop mt-14 max-w-3xl">
        <h2 className="mb-4 text-2xl font-semibold text-brand-900">
          Зачем подбирать свет по машине
        </h2>
        <p>
          Стекло фары и линза — детали, которые подходят не «примерно», а
          строго к своей модели и своему поколению: у рестайлинга посадочные
          места и крепления отличаются от дорестайлинга, хотя машина внешне та
          же. С лампами проще — они привязаны к цоколю, — но и здесь цоколь
          ближнего света у одной модели меняется от года к году.
        </p>
        <p>
          Поэтому подбор идёт до поколения, а не до модели: так в выборке
          остаётся то, что встанет без доработок. Если вашей машины в списке
          нет, это не значит, что ничего не подойдёт — позвоните по номеру{" "}
          <a
            href={`tel:${site.phoneHref}`}
            className="font-medium text-brand-900 underline decoration-accent-400 decoration-2 underline-offset-4 hover:decoration-accent-600"
          >
            {site.phone}
          </a>
          , подскажем по VIN или по фотографии фары.
        </p>
      </section>
    </div>
  );
}
