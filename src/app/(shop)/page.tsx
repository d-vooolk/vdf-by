import type { Metadata } from "next";
import Link from "next/link";

import { CarPicker } from "@/components/CarPicker";
import { CategoryGrid } from "@/components/CategoryTile";
import { HomeQuickLinks } from "@/components/HomeQuickLinks";
import { JsonLd } from "@/components/JsonLd";
import { ProductCard } from "@/components/ProductCard";
import {
  CheckIcon,
  ChevronRightIcon,
  PhoneIcon,
  ShieldIcon,
  TruckIcon,
} from "@/components/icons";
import { pickerMarks } from "@/lib/car-picker";
import {
  getNewestProducts,
  getPopularProducts,
  getRootCategories,
  getSite,
} from "@/lib/catalog";
import { buildMetadata, organizationJsonLd } from "@/lib/seo";

export function generateMetadata(): Metadata {
  const site = getSite();
  return buildMetadata({
    title: "Автосвет в Минске: линзы, стёкла фар, лампы",
    description: site.description,
    path: "/",
  });
}

export const revalidate = 3600;

const ICONS = [TruckIcon, ShieldIcon, CheckIcon, PhoneIcon];

export default function HomePage() {
  const site = getSite();
  const categories = getRootCategories();
  const featured = getPopularProducts(10);
  const newest = getNewestProducts(10);
  const marks = pickerMarks();
  return (
    <>
      <JsonLd data={organizationJsonLd()} />

      {/* ----------------------------- Хиро ----------------------------- */}
      {/*
        Первый экран прошёл два состояния. Сначала это была сплошная синяя
        заливка во всю ширину: заметно, но белый текст на цвете читается
        хуже чёрного на белом, а фотографии товаров рядом выглядели
        вырезанными из другого сайта. Потом фон стал белым — стало чисто,
        но пусто: половина экрана уходила под четыре одинаковых
        прямоугольника со ссылками на разделы.

        Теперь правую половину занимает то, чем магазин торгует, — линза.
        Она нарисована градиентами (классы .lens-* в globals.css), поэтому
        не зависит от того, залиты ли фотографии в media/, и не добавляет
        к странице ни байта.

        Ссылки на разделы из хиро убраны без потери: сразу под ним идёт
        секция «Категории», где те же разделы даны все и с картинками, а в
        шапке они есть на каждой странице сайта.
      */}
      <section className="beam grid-hint relative overflow-hidden border-b border-brand-100">
        <div className="container-page grid gap-8 py-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-8 lg:py-6">
          <div>
            {/* h1 на главной — под самый частотный запрос. Текст менять
                нельзя, а подать его крупнее можно. */}
            <h1 className="text-[1.75rem] leading-[1.1] font-semibold text-brand-900 sm:text-4xl lg:text-[2.4rem]">
              Автосвет в Минске:{" "}
              <span className="whitespace-nowrap">
              <span className="relative inline-block whitespace-nowrap">
                линзы
                {/* Подчёркивание рисуем сами: у text-decoration нельзя
                    задать ни толщину в долях кегля, ни мягкий цвет.
                    Поверх него .sweep гоняет блик — тот самый свет. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-0.5 -z-10 h-[0.3em] rounded-full bg-accent-300"
                />
                <span
                  aria-hidden="true"
                  className="sweep absolute inset-x-0 -bottom-0.5 -z-10 h-[0.3em] rounded-full"
                />
              </span>
              ,
              </span>{" "}
              стёкла фар и лампы
            </h1>

            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-brand-500 sm:text-base">
              Би-ЛЕД и би-ксеноновые модули, стёкла на замену помутневшим,
              лампы во всех популярных цоколях. Проверяем каждый комплект на
              стенде перед отправкой.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/catalog/" className="btn-primary">
                Смотреть каталог
                <ChevronRightIcon className="h-4 w-4" />
              </Link>
              <a href={`tel:${site.phoneHref}`} className="btn-secondary">
                <PhoneIcon className="h-4 w-4" />
                {site.phone}
              </a>
            </div>

            <dl className="mt-5 grid max-w-lg grid-cols-3 gap-4 border-t border-brand-100 pt-4 sm:gap-6">
              <div>
                <dt className="text-xs text-brand-400">Доставка по Минску</dt>
                <dd className="mt-1 text-[15px] font-semibold text-brand-900">
                  в день заказа
                </dd>
              </div>
              <div>
                <dt className="text-xs text-brand-400">Оплата</dt>
                <dd className="mt-1 text-[15px] font-semibold text-brand-900">
                  при получении
                </dd>
              </div>
              <div>
                <dt className="text-xs text-brand-400">Гарантия</dt>
                <dd className="mt-1 text-[15px] font-semibold text-brand-900">
                  до 12 мес.
                </dd>
              </div>
            </dl>
          </div>

          {/* Линза. Блок чисто декоративный: ничего, чего нет в тексте
              слева, он не сообщает, поэтому от скринридера скрыт целиком.

              На мобильных его нет: круг с плашками «би-ЛЕД» и «5000K»
              занимал там почти весь первый экран, а каталог уезжал за
              нижний край. */}
          <div
            className="rise relative mx-auto hidden w-full max-w-[13rem] lg:block lg:max-w-[14rem]"
            style={{ animationDelay: "120ms" }}
            aria-hidden="true"
          >
            <div className="lens-stage">
              <span className="lens-rays" />
              <span className="lens-halo" />
              <span className="lens-bezel">
                <span className="lens-glass block" />
              </span>

              <span className="lens-chip top-[6%] left-0">би-ЛЕД</span>
              <span
                className="lens-chip top-[32%] right-0"
                style={{ animationDelay: "1.4s" }}
              >
                5000K
              </span>
              <span
                className="lens-chip bottom-[9%] left-[6%]"
                style={{ animationDelay: "2.6s" }}
              >
                2.5″ и 3″
              </span>
            </div>
          </div>
        </div>

      </section>

      {/* ---------------------- Подбор по машине ------------------------ */}
      {/*
        Секции нет, пока ни один товар не привязан к машине: три пустых
        выпадающих списка под первым экраном — это не «скоро заполним», это
        сломанный сайт в глазах посетителя.
      */}
      {marks.length > 0 && (
        <section className="border-b border-brand-100 bg-brand-50/50 py-7 sm:py-8">
          <div className="container-page">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-brand-900 sm:text-2xl">
                Поиск по автомобилю
              </h2>
              <Link
                href="/podbor/"
                className="group hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-700 sm:flex"
              >
                Все марки
                <ChevronRightIcon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </div>

            <CarPicker marks={marks} />
          </div>
        </section>
      )}

      {/* --------------------------- Категории -------------------------- */}
      <section className="container-page pt-8 pb-16 sm:pt-10 sm:pb-20">
        <div className="mb-6 flex items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Каталог</p>
            <h2 className="mt-3 text-3xl font-semibold text-brand-900 sm:text-4xl">
              Категории
            </h2>
            <p className="mt-3 text-[15px] text-brand-500">
              Не уверены, что подойдёт к вашей машине — позвоните, подберём.
            </p>
          </div>
          <Link
            href="/catalog/"
            className="group hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-700 sm:flex"
          >
            Весь каталог
            <ChevronRightIcon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>

        <CategoryGrid categories={categories} />
      </section>

      <HomeQuickLinks />

      {/* ---------------------------- Хиты ------------------------------ */}
      {featured.length > 0 && (
        <section className="border-y border-brand-100 bg-brand-50/50 py-20">
          <div className="container-page">
            <div className="reveal mb-10">
              <p className="eyebrow">Популярное</p>
              <h2 className="mt-3 text-3xl font-semibold text-brand-900 sm:text-4xl">
                Выбирают чаще всего
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
              {featured.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  currencySymbol={site.currencySymbol}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {newest.length > 0 && (
        <section className="border-b border-brand-100 py-20">
          <div className="container-page">
            <div className="reveal mb-10">
              <p className="eyebrow">Новинки</p>
              <h2 className="mt-3 text-3xl font-semibold text-brand-900 sm:text-4xl">
                Недавно в каталоге
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
              {newest.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  currencySymbol={site.currencySymbol}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* -------------------------- Почему мы --------------------------- */}
      {site.features.length > 0 && (
        <section className="container-page py-20">
          <div className="reveal mb-10">
            <p className="eyebrow">Как мы работаем</p>
            <h2 className="mt-3 text-3xl font-semibold text-brand-900 sm:text-4xl">
              Почему у нас спокойно покупать
            </h2>
          </div>
          {/* Без карточек: четыре обведённых прямоугольника подряд — это
              четыре рамки, которые спорят друг с другом. Достаточно одной
              вертикальной линии слева, она же задаёт ритм колонок. */}
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {site.features.map((feature, position) => {
              const Icon = ICONS[position % ICONS.length];
              return (
                <div
                  key={feature.title}
                  className="reveal border-l border-brand-100 pl-5"
                >
                  <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-control bg-accent-100 text-accent-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-[15px] font-semibold text-brand-900">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-brand-500">
                    {feature.text}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ------------------------ Текст для поиска ---------------------- */}
      <section className="border-t border-brand-100 bg-brand-50/50 py-20">
        <div className="container-page prose-shop max-w-3xl">
          <h2 className="mb-5 text-2xl font-semibold text-brand-900">
            Автосвет с доставкой по Минску и Беларуси
          </h2>
          <p>
            {site.name} — магазин деталей автомобильного освещения. В каталоге
            би-ЛЕД и би-ксеноновые линзы диаметром 2.5″ и 3″, стёкла передних
            фар на замену помутневшим и треснувшим, галогенные, ксеноновые и
            светодиодные лампы в цоколях H1, H4, H7, H11, HB3, HB4, D2S, а
            также блоки розжига, обманки CAN-шины и всё для установки.
          </p>
          <p>
            Лампы и стёкла продаются в вариантах: выберите на странице товара
            нужный цоколь или сторону — цена, наличие и фотографии обновятся
            под выбранный вариант. Если не знаете, какой цоколь стоит в вашей
            машине, позвоните по номеру{" "}
            <a
              href={`tel:${site.phoneHref}`}
              className="font-medium text-brand-900 underline decoration-accent-400 decoration-2 underline-offset-4 hover:decoration-accent-600"
            >
              {site.phone}
            </a>{" "}
            — подскажем по VIN или по модели.
          </p>
          <p>
            Заказ оформляется без онлайн-оплаты: вы выбираете товар, оставляете
            телефон, менеджер перезванивается и подтверждает наличие. Оплата
            наличными или картой при получении.{" "}
            <Link
              href="/delivery/"
              className="font-medium text-brand-900 underline decoration-accent-400 decoration-2 underline-offset-4 hover:decoration-accent-600"
            >
              Условия доставки и оплаты
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
