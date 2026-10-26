import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { PhoneIcon, TruckIcon } from "@/components/icons";
import { getSite } from "@/lib/catalog";
import { buildMetadata, organizationJsonLd } from "@/lib/seo";
import { DISCLAIMER_FULL } from "@/lib/disclaimer";

export function generateMetadata(): Metadata {
  const site = getSite();
  return buildMetadata({
    title: "Контакты — магазин автосвета в Минске",
    description: `${site.name}: ${site.address.city}, ${site.address.street}. Телефон ${site.phone}, ${site.workHours}.`,
    path: "/contacts/",
  });
}

export default function ContactsPage() {
  const site = getSite();

  return (
    <div className="container-page">
      <Breadcrumbs items={[{ label: "Контакты" }]} />
      {/* Та же разметка Store, что на главной: подтверждает адрес и телефон
          для локального поиска и карт. */}
      <JsonLd data={organizationJsonLd()} />

      <header className="mb-9 max-w-2xl">
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">
          Контакты
        </h1>
        <p className="mt-3 text-base text-brand-500">
          Звоните или пишите — поможем подобрать линзы, лампы или стекло под
          вашу модель автомобиля.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="card p-5">
          <h2 className="mb-3 flex items-center gap-2.5 text-lg font-bold text-brand-900">
            <PhoneIcon className="h-5 w-5 text-brand-700" />
            Связаться
          </h2>
          <a
            href={`tel:${site.phoneHref}`}
            className="tnum block text-xl font-semibold text-brand-900 hover:text-brand-700"
          >
            {site.phone}
          </a>
          <a
            href={`mailto:${site.email}`}
            className="mt-2 block text-sm text-brand-700 hover:underline"
          >
            {site.email}
          </a>
          <div className="mt-4 flex flex-wrap gap-2">
            {site.telegram && (
              <a
                href={site.telegram}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="btn-secondary py-2 text-xs"
              >
                Telegram
              </a>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-lg font-bold text-brand-900">Адрес</h2>
          <address className="text-sm leading-relaxed text-brand-600 not-italic">
            {site.address.postalCode}, {site.address.city}
            <br />
            {site.address.street}
          </address>
          <p className="mt-3 text-sm text-brand-500">{site.workHours}</p>
          <p className="mt-3 text-xs text-brand-400">
            Самовывоз бесплатный. Заказ храним 3 дня.
          </p>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 flex items-center gap-2.5 text-lg font-bold text-brand-900">
            <TruckIcon className="h-5 w-5 text-brand-700" />
            Доставка
          </h2>
          <ul className="space-y-2.5 text-sm text-brand-600">
            {site.delivery.methods.map((method) => (
              <li key={method.id}>
                <span className="font-semibold">{method.name}</span>
                {method.note && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-brand-400">
                    {method.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section className="prose-shop mt-12 max-w-3xl">
        <h2 className="mb-3 text-xl font-semibold text-brand-900">
          Как мы помогаем с подбором
        </h2>
        <p>
          Автосвет — та область, где ошибиться легко: у одной и той же модели
          автомобиля в разных комплектациях стоят разные фары, а значит разные
          цоколи и разные посадочные места под линзу. Поэтому мы просим
          указывать модель и год выпуска в комментарии к заказу, а при
          сомнениях — VIN.
        </p>
        <p>
          Если не знаете, что у вас стоит сейчас, позвоните по номеру{" "}
          <a
            href={`tel:${site.phoneHref}`}
            className="font-medium text-brand-700 hover:underline"
          >
            {site.phone}
          </a>{" "}
          — разберёмся вместе. Это быстрее, чем заказать не то и потом менять.
        </p>
        <p className="mt-6 text-sm text-brand-500">{DISCLAIMER_FULL}</p>
      </section>
    </div>
  );
}
