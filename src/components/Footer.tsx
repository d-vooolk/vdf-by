import Link from "next/link";

import { ContactButtons } from "@/components/ContactButtons";
import { INFO_PAGES } from "@/components/Header";
import { HeadlightIcon, PhoneIcon } from "@/components/icons";
import { getCarTree } from "@/lib/cars";
import { categoryUrl, getRootCategories, getSite } from "@/lib/catalog";
import { getChannels } from "@/lib/contacts";

export function Footer() {
  const site = getSite();
  const categories = getRootCategories();
  const hasCars = getCarTree().length > 0;
  // Тот же список, что в панели справа и на карточках товаров: ссылки на
  // мессенджеры собираются в одном месте — src/lib/contacts.ts.
  const channels = getChannels(site);
  // Считается на сборке и запекается в HTML — обновится при следующем деплое.
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-brand-100 bg-brand-50/50">
      <div className="container-page grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-control bg-brand-900 text-accent-400">
              <HeadlightIcon className="h-5 w-5" />
            </span>
            <span className="text-[15px] font-semibold text-brand-900">
              {site.name}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-brand-500">
            {site.tagline}. Подберём комплект под вашу модель авто и проверим
            перед отправкой.
          </p>
        </div>

        <nav aria-label="Каталог">
          <h2 className="mb-4 text-xs font-semibold tracking-[0.14em] text-brand-400 uppercase">Каталог</h2>
          <ul className="space-y-2 text-sm">
            {hasCars && (
              <li>
                <Link
                  href="/podbor/"
                  className="text-brand-500 transition-colors hover:text-brand-900"
                >
                  Подбор по авто
                </Link>
              </li>
            )}
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={categoryUrl(category)}
                  className="text-brand-500 transition-colors hover:text-brand-900"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Информация">
          <h2 className="mb-4 text-xs font-semibold tracking-[0.14em] text-brand-400 uppercase">
            Информация
          </h2>
          <ul className="space-y-2 text-sm">
            {INFO_PAGES.map((page) => (
              <li key={page.href}>
                <Link
                  href={page.href}
                  className="text-brand-500 transition-colors hover:text-brand-900"
                >
                  {page.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="mb-4 text-xs font-semibold tracking-[0.14em] text-brand-400 uppercase">Связаться</h2>
          <a
            href={`tel:${site.phoneHref}`}
            className="flex items-center gap-2 text-base font-semibold text-brand-900 transition-colors hover:text-brand-500"
          >
            <PhoneIcon className="h-4 w-4 text-brand-300" />
            {site.phone}
          </a>
          <p className="mt-2 text-sm text-brand-500">{site.workHours}</p>
          <a
            href={`mailto:${site.email}`}
            className="mt-2 block text-sm text-brand-500 transition-colors hover:text-brand-900"
          >
            {site.email}
          </a>
          <p className="mt-2 text-sm text-brand-500">
            {site.address.city}, {site.address.street}
          </p>
          <ContactButtons channels={channels} size={32} className="mt-4" />
        </div>
      </div>

      <div className="border-t border-brand-100">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-brand-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site.legalName}. Цены на сайте не являются публичной
            офертой.
          </p>
          <Link href="/privacy/" className="transition-colors hover:text-brand-700">
            Политика обработки персональных данных
          </Link>
          <p>Оплата при получении. Доставка по Минску и Беларуси.</p>
        </div>
      </div>
    </footer>
  );
}
