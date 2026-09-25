import Link from "next/link";

import { AccountLink } from "@/components/AccountLink";
import { CartBadge } from "@/components/CartBadge";
import { HomeLink } from "@/components/HomeLink";
import { PhoneIcon } from "@/components/icons";
import { MobileMenu } from "@/components/MobileMenu";
import { SearchBox } from "@/components/SearchBox";
import { getCarTree } from "@/lib/cars";
import {
  categoryUrl,
  getCategoryCounts,
  getChildCategories,
  getRootCategories,
  getSite,
} from "@/lib/catalog";

/** Статические страницы — в одном месте, чтобы меню и подвал не разъезжались. */
export const INFO_PAGES = [
  { href: "/delivery/", label: "Доставка и оплата" },
  { href: "/about/", label: "О магазине" },
  { href: "/contacts/", label: "Контакты" },
];

export function Header() {
  const site = getSite();
  const counts = getCategoryCounts();

  // Меню строится по дереву: раздел верхнего уровня и его подразделы.
  // Считаем один раз здесь — и мобильное меню, и полоса категорий на
  // десктопе показывают одно и то же.
  // Подбор по машине появляется в меню, только когда в нём что-то есть:
  // пункт, ведущий на пустую страницу, хуже отсутствующего.
  const carsLink = getCarTree().length
    ? [{ href: "/podbor/", label: "Подбор по авто" }]
    : [];

  const categoryLinks = getRootCategories().map((category) => ({
    href: categoryUrl(category),
    label: category.menuName ?? category.name,
    count: counts[category.id] ?? 0,
    children: getChildCategories(category.id).map((child) => ({
      href: categoryUrl(child),
      label: child.menuName ?? child.name,
      count: counts[child.id] ?? 0,
    })),
  }));

  return (
    // Полупрозрачный фон с размытием: при прокрутке содержимое просвечивает
    // сквозь шапку, и она перестаёт быть отдельной плашкой поверх страницы.
    <header className="sticky top-0 z-50 border-b border-brand-100 bg-white/80 backdrop-blur-xl">
      {/* Верхняя полоса: на мобильных прячем — там эта информация уезжает
          в меню и в подвал, а место на первом экране дороже. */}
      <div className="hidden border-b border-brand-100/70 lg:block">
        <div className="container-page flex h-10 items-center justify-between gap-6 text-[13px] text-brand-400">
          <nav className="flex items-center gap-5" aria-label="Основные разделы">
            {[{ href: "/catalog/", label: "Каталог" }, ...carsLink, ...INFO_PAGES].map(
              (link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="font-medium text-brand-600 transition-colors hover:text-brand-900"
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>
          <span className="flex shrink-0 items-center gap-5">
            <span>{site.workHours}</span>
            <AccountLink />
          </span>
        </div>
      </div>

      <div className="container-page flex h-16 items-center gap-3 lg:h-[4.5rem] lg:gap-6">
        <MobileMenu
          categories={[...carsLink, ...categoryLinks]}
          pages={INFO_PAGES}
          phone={site.phone}
          phoneHref={site.phoneHref}
          workHours={site.workHours}
        />

        <HomeLink
          className="flex shrink-0 items-center transition-opacity hover:opacity-80"
          ariaLabel={`${site.name} — на главную`}
        >
          <img
            src="/brand/logo.png"
            alt={site.name}
            width={600}
            height={100}
            className="h-5 w-auto sm:h-6 lg:h-7"
          />
        </HomeLink>

        <div className="min-w-0 flex-1">
          <SearchBox currencySymbol={site.currencySymbol} />
        </div>

        <a
          href={`tel:${site.phoneHref}`}
          className="hidden shrink-0 items-center gap-2 rounded-control px-3 py-2 transition-colors hover:bg-brand-50 xl:flex"
        >
          <PhoneIcon className="h-5 w-5 text-brand-400" />
          <span>
            <span className="block text-sm leading-tight font-semibold text-brand-900">
              {site.phone}
            </span>
            <span className="block text-[11px] leading-tight text-brand-400">
              Звоните, поможем с выбором
            </span>
          </span>
        </a>

        <AccountLink compact />
        <CartBadge currencySymbol={site.currencySymbol} />
      </div>
    </header>
  );
}
