import Link from "next/link";

import { CartBadge } from "@/components/CartBadge";
import { ChevronDownIcon, PhoneIcon } from "@/components/icons";
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
        <div className="container-page flex h-9 items-center justify-between text-xs text-brand-400">
          <p>{site.tagline}</p>
          <div className="flex items-center gap-6">
            <span>{site.workHours}</span>
            <Link href="/delivery/" className="transition-colors hover:text-brand-700">
              Доставка по Минску и Беларуси
            </Link>
          </div>
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

        <Link
          href="/"
          className="flex shrink-0 items-center transition-opacity hover:opacity-80"
          aria-label={`${site.name} — на главную`}
        >
          <img
            src="/brand/logo.png"
            alt={site.name}
            width={600}
            height={100}
            className="h-5 w-auto sm:h-6 lg:h-7"
          />
        </Link>

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

        <CartBadge currencySymbol={site.currencySymbol} />
      </div>

      {/* Ссылки на категории в шапке — не только навигация, но и внутренняя
          перелинковка: краулер видит все разделы с любой страницы сайта. */}
      <nav
        className="hidden border-t border-brand-100/70 lg:block"
        aria-label="Категории"
      >
        {/*
          Пункт меню не сжимается и не переносится по словам.

          Раньше здесь стояли фиксированная высота h-11 и обычный flex: при
          десятке разделов пункты сжимались до ширины буквы, «Блоки розжига»
          ломались на три строки и всё равно не помещались. Теперь у каждого
          shrink-0 и whitespace-nowrap, а не влезающие пункты переносятся на
          вторую строку целиком.

          Прокрутку по горизонтали сюда ставить нельзя: overflow обрезал бы
          выпадающие панели подразделов — они висят ниже полосы.
        */}
        <div className="container-page flex min-h-11 flex-wrap items-center gap-1 py-1">
          <Link
            href="/catalog/"
            className="flex shrink-0 items-center rounded-control px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-brand-900 transition-colors hover:bg-brand-50"
          >
            Весь каталог
          </Link>
          {carsLink.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex shrink-0 items-center rounded-control px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-brand-900 transition-colors hover:bg-brand-50"
            >
              {link.label}
            </Link>
          ))}
          {categoryLinks.map((link) =>
            link.children.length === 0 ? (
              <Link
                key={link.href}
                href={link.href}
                className="flex shrink-0 items-center rounded-control px-3 py-1.5 text-sm whitespace-nowrap text-brand-500 transition-colors hover:bg-brand-50 hover:text-brand-900"
              >
                {link.label}
              </Link>
            ) : (
              // Подразделы раскрываются на наведение и на фокус с
              // клавиатуры, без JS: панель всегда в разметке, меняется
              // только видимость. Значит, её видит и краулер — ссылки на
              // подразделы стоят на каждой странице сайта.
              <div key={link.href} className="group relative flex shrink-0 items-center">
                <Link
                  href={link.href}
                  className="flex items-center gap-1 rounded-control px-3 py-1.5 text-sm whitespace-nowrap text-brand-500 transition-colors group-hover:bg-brand-50 group-hover:text-brand-900 group-focus-within:bg-brand-50"
                >
                  {link.label}
                  <ChevronDownIcon className="h-3.5 w-3.5 text-brand-300" />
                </Link>
                <div className="invisible absolute top-full left-0 z-40 min-w-52 rounded-control border border-brand-100 bg-white p-1.5 whitespace-nowrap opacity-0 shadow-card-hover transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  {link.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className="flex items-center justify-between gap-4 rounded-control px-3 py-2 text-sm text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-900"
                    >
                      {child.label}
                      <span className="tnum text-xs text-brand-300">
                        {child.count}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      </nav>
    </header>
  );
}
