import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { ServiceOffer } from "@/components/ServiceOffer";
import { absoluteUrl, buildMetadata } from "@/lib/seo";
import {
  SERVICE_PHONE,
  SERVICE_PHONE_HREF,
  SERVICE_SITE,
  SERVICE_SITE_NAME,
} from "@/lib/service-contacts";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Установка автосвета в Минске: стёкла фар, линзы, световоды",
    description:
      "Установим купленные детали в нашем сервисе в Минске: замена стёкол фар, установка Bi-LED линз, световодов и рамок, регулировка света. Расчёт по телефону.",
    path: "/ustanovka/",
  });
}

const REPAIR_PAGE = `${SERVICE_SITE}uslugi/remont-far`;
const LIGHT_PAGE = `${SERVICE_SITE}uslugi/uluchshenie-kachestva-sveta`;
const PRICE_PAGE = `${SERVICE_SITE}price`;

const WORKS = [
  {
    title: "Замена стёкол фар",
    text: "Аккуратно вскрываем фару, снимаем старое стекло, чистим корпус от герметика и ставим новое на свежий бутил. После сборки проверяем фару на герметичность.",
    href: REPAIR_PAGE,
  },
  {
    title: "Установка Bi-LED и би-ксеноновых линз",
    text: "Ставим линзы на переходные рамки под вашу фару, выставляем светотеневую границу и проверяем свет на стене, чтобы он не слепил встречных.",
    href: LIGHT_PAGE,
  },
  {
    title: "Замена световодов и ремонт ходовых огней",
    text: "Меняем пожелтевшие и потрескавшиеся световоды, восстанавливаем равномерное свечение ДХО и габаритов.",
    href: REPAIR_PAGE,
  },
  {
    title: "Ремонт и замена корпусов фар",
    text: "Восстанавливаем сломанные крепления и трещины пайкой пластика, переклеиваем негерметичные фары, меняем корпус целиком, если ремонт не имеет смысла.",
    href: REPAIR_PAGE,
  },
  {
    title: "Установка ламп и блоков розжига",
    text: "Подбираем цоколь, ставим лампы и блоки розжига, при необходимости — обманки и CAN-декодеры, чтобы не горели ошибки на приборной панели.",
    href: LIGHT_PAGE,
  },
];

const PRICES = [
  { work: "Снятие и установка фары без снятия бампера", price: "от 10 р. за сторону" },
  { work: "Снятие и установка бампера и фар", price: "100 р." },
  { work: "Разборка и сборка стекла фары на бутиловом герметике", price: "150 р." },
  { work: "Разборка и сборка стекла фары на полиуретановом герметике", price: "200 р." },
  { work: "Разборка и сборка внутренних элементов фары", price: "от 50 р." },
  { work: "Установка или замена модуля освещения, одна фара", price: "от 50 р." },
  { work: "То же для фар с адаптивной системой", price: "от 100 р." },
  { work: "Ремонт пластика сваркой", price: "4 р. за 1 см шва" },
  { work: "Регулировка света фар", price: "50 р." },
];

const FAQ = [
  {
    q: "Сколько стоит установка?",
    a: "Основные работы — в таблице цен выше: например, разборка и сборка фары на бутиловом герметике стоит 150 р., установка модуля в одну фару — от 50 р. Детали оплачиваются отдельно. Точную смету мастер называет после осмотра, до начала работ.",
  },
  {
    q: "Можно ли установить деталь, купленную не у вас?",
    a: "Да. Уточните модель автомобиля и что за деталь — мастер скажет, подойдёт ли она к вашей фаре и сколько займёт работа.",
  },
  {
    q: "Нужно ли оставлять машину на день?",
    a: "Замена ламп занимает минуты, установка линз и замена стёкол — дольше, потому что фару нужно вскрыть и собрать. Точное время мастер скажет при записи.",
  },
];

export default function InstallationPage() {
  return (
    <div className="container-page">
      <Breadcrumbs items={[{ label: "Установка" }]} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Service",
              name: "Установка автомобильного света",
              serviceType: "Установка и ремонт автомобильных фар",
              areaServed: { "@type": "City", name: "Минск" },
              provider: { "@id": absoluteUrl("/#store") },
              url: absoluteUrl("/ustanovka/"),
            },
            {
              "@type": "FAQPage",
              mainEntity: FAQ.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: { "@type": "Answer", text: item.a },
              })),
            },
          ],
        }}
      />

      <header className="mb-9 max-w-2xl">
        <h1 className="text-3xl font-semibold text-brand-900 sm:text-4xl">
          Установка автосвета в Минске
        </h1>
        <p className="mt-3 text-base text-brand-500">
          Детали из нашего каталога можно сразу установить в нашем сервисе: стёкла фар, линзы,
          световоды, лампы и блоки розжига. Мастер заранее назовёт цену и время работы.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <ServiceOffer variant="page" />
          <a href={`tel:${SERVICE_PHONE_HREF}`} className="tnum text-base font-semibold text-brand-900 underline">
            {SERVICE_PHONE}
          </a>
        </div>
      </header>

      <section className="mb-12 grid gap-4 sm:grid-cols-2">
        {WORKS.map((work) => (
          <div key={work.title} className="card p-5">
            <h2 className="text-base font-semibold text-brand-900">{work.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-brand-500">{work.text}</p>
            <a
              href={work.href}
              target="_blank"
              rel="noopener"
              className="mt-3 inline-block text-sm font-medium text-brand-700 underline hover:text-brand-900"
            >
              Подробнее на сайте мастерской
            </a>
          </div>
        ))}
      </section>

      <section className="mb-12 max-w-3xl">
        <h2 className="mb-2 text-xl font-semibold text-brand-900">Цены на работы</h2>
        <p className="mb-4 text-sm text-brand-500">
          Стоимость работ мастерской без учёта деталей. Точную смету мастер называет после осмотра, до начала
          работ.
        </p>
        <div className="overflow-hidden rounded-card border border-brand-100">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-brand-100">
              {PRICES.map((row) => (
                <tr key={row.work}>
                  <td className="px-4 py-2.5 text-brand-900">{row.work}</td>
                  <td className="tnum px-4 py-2.5 text-right whitespace-nowrap font-medium text-brand-900">{row.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-brand-500">
          Полный и актуальный прайс —{" "}
          <a href={PRICE_PAGE} target="_blank" rel="noopener" className="font-medium text-brand-900 underline">
            на сайте мастерской
          </a>
          .
        </p>
      </section>

      <section className="mb-12 max-w-3xl">
        <h2 className="mb-5 text-xl font-semibold text-brand-900">Частые вопросы</h2>
        <div className="space-y-3">
          {FAQ.map((item) => (
            <details key={item.q} className="card group p-4">
              <summary className="cursor-pointer list-none text-[15px] font-semibold text-brand-900 marker:hidden">
                {item.q}
              </summary>
              <p className="mt-2.5 text-sm leading-relaxed text-brand-500">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="mb-4 rounded-card bg-brand-50 p-6 text-center">
        <p className="text-base font-semibold text-brand-900">Сайт сервиса</p>
        <p className="mt-1.5 text-sm text-brand-500">
          Все работы, адрес и время работы мастерской —{" "}
          <a href={SERVICE_SITE} target="_blank" rel="noopener" className="font-medium text-brand-900 underline">
            {SERVICE_SITE_NAME}
          </a>
          . Подобрать детали под свою машину можно в{" "}
          <Link href="/catalog/" className="font-medium text-brand-900 underline">
            каталоге
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
