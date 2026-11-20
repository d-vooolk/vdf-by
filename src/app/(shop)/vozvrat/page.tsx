import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getSite } from "@/lib/catalog";
import { plural } from "@/lib/format";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  const site = getSite();
  return buildMetadata({
    title: "Возврат и обмен товара",
    description: `Как вернуть или обменять автосвет, купленный в ${site.name}: ${site.returnDays} ${plural(site.returnDays, "день", "дня", "дней")} на возврат товара надлежащего качества, обмен по цоколю и стороне, гарантия на брак.`,
    path: "/vozvrat/",
  });
}

export default function ReturnsPage() {
  const site = getSite();
  const days = site.returnDays;
  const address = [site.address.postalCode, site.address.city, site.address.street].filter(Boolean).join(", ");

  return (
    <div className="container-page">
      <Breadcrumbs items={[{ label: "Возврат и обмен" }]} />

      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">Возврат и обмен</h1>

        <div className="prose-shop mt-6">
          <p>
            Возврат и обмен — по Закону Республики Беларусь «О защите прав потребителей». Ниже — как это
            устроено у нас на практике.
          </p>

          {days > 0 && (
            <>
              <h2 className="mt-8 mb-3 text-xl font-semibold text-brand-900">Товар надлежащего качества</h2>
              <p>
                Вернуть или обменять товар можно в течение {days} {plural(days, "дня", "дней", "дней")} с момента
                получения, если:
              </p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5">
                <li>товар не устанавливали и на нём нет следов монтажа;</li>
                <li>сохранены упаковка, комплектность и товарный вид;</li>
                <li>есть чек или номер заказа.</li>
              </ul>
              <p className="mt-3">
                Возврат и обмен принимаем в магазине. Пересылку товара обратно оплачивает покупатель. Деньги
                возвращаем тем же способом, каким была оплата, после проверки товара.
              </p>
            </>
          )}

          <h2 className="mt-8 mb-3 text-xl font-semibold text-brand-900">Не подошёл цоколь или сторона</h2>
          <p>
            Обменяем на нужный вариант. Чтобы этого не случилось, напишите в комментарии к заказу модель и год
            автомобиля или пришлите VIN — менеджер проверит совместимость до отправки.
          </p>

          <h2 className="mt-8 mb-3 text-xl font-semibold text-brand-900">Товар с заводским дефектом</h2>
          <p>
            {site.warranty} Срок гарантии на конкретный товар указан в его карточке. Товар с заводским дефектом
            меняем на исправный или возвращаем деньги. Повреждения при установке и следы неправильного монтажа
            гарантией не покрываются.
          </p>

          <h2 className="mt-8 mb-3 text-xl font-semibold text-brand-900">Как оформить возврат или обмен</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5">
            <li>
              Позвоните по номеру{" "}
              <a href={`tel:${site.phoneHref}`} className="font-medium text-brand-700 hover:underline">
                {site.phone}
              </a>{" "}
              или напишите на{" "}
              <a href={`mailto:${site.email}`} className="font-medium text-brand-700 hover:underline">
                {site.email}
              </a>
              : номер заказа и что случилось.
            </li>
            <li>
              Привезите товар в магазин: {address}. {site.workHours}.
            </li>
            <li>Мы проверим товар и обменяем его или вернём деньги.</li>
          </ol>

          <h2 className="mt-8 mb-3 text-xl font-semibold text-brand-900">Продавец</h2>
          <p>
            {site.legalName}
            {site.unp ? `, УНП ${site.unp}` : ""}. Адрес: {address}. Телефон: {site.phone}. Email: {site.email}.
          </p>
          <p className="mt-3">
            Подробнее о доставке и оплате — на странице{" "}
            <Link href="/delivery/" className="font-medium text-brand-700 hover:underline">
              «Доставка и оплата»
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
