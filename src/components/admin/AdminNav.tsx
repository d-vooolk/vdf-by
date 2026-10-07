"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { logoutAction } from "@/app/admin/actions";
import { ChevronDownIcon, CloseIcon, MenuIcon } from "@/components/icons";

/**
 * Шапка админки: разделы, счётчик новых заказов, выход.
 *
 * Клиентский компонент только ради подсветки текущего раздела и меню на
 * телефоне — данные приходят готовыми из макета.
 */

interface NavLink {
  href: string;
  label: string;
  exact?: boolean;
  badge?: "orders" | "customers" | "service";
}

interface NavGroup {
  label: string;
  links: NavLink[];
}

const NAV: Array<NavLink | NavGroup> = [
  {
    label: "Сводка",
    links: [
      { href: "/admin/", label: "Общая", exact: true },
      { href: "/admin/seo/", label: "SEO" },
    ],
  },
  {
    label: "Товары",
    links: [
      { href: "/admin/products/", label: "Все товары" },
      { href: "/admin/categories/", label: "Категории" },
      { href: "/admin/incomplete/", label: "Незаполненные" },
      { href: "/admin/out-of-stock/", label: "Нет в наличии" },
      { href: "/admin/frame-types/", label: "Типы рамок" },
    ],
  },
  { href: "/admin/orders/", label: "Заказы", badge: "orders" },
  { href: "/admin/service-requests/", label: "Установка", badge: "service" },
  { href: "/admin/customers/", label: "Покупатели", badge: "customers" },
  { href: "/admin/accounting/", label: "Бухгалтерия" },
  { href: "/admin/articles/", label: "Статьи" },
  {
    label: "Импорт",
    links: [
      { href: "/admin/vdf-catalog/", label: "Каталог VDF" },
      { href: "/admin/vdf-prices/", label: "Курсы и цены" },
    ],
  },
  {
    label: "Справочник",
    links: [
      { href: "/admin/cars/", label: "Автомобили" },
      { href: "/admin/media/", label: "Фото" },
      { href: "/admin/unused-photos/", label: "Неиспользуемые фото" },
      { href: "/admin/ai/", label: "Нейросеть для текста" },
      { href: "/admin/composer/", label: "Генератор картинок" },
    ],
  },
  { href: "/admin/settings/", label: "Настройки" },
];

const isGroup = (item: NavLink | NavGroup): item is NavGroup => "links" in item;

interface AdminNavProps {
  siteName: string;
  login: string;
  newOrders: number;
  pendingWholesale: number;
  openService: number;
}

export function AdminNav({ siteName, login, newOrders, pendingWholesale, openService }: AdminNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href.replace(/\/$/, "") || pathname === href
      : pathname.startsWith(href.replace(/\/$/, ""));

  const badgeCount = (badge: NavLink["badge"]) =>
    badge === "orders"
      ? newOrders
      : badge === "customers"
        ? pendingWholesale
        : badge === "service"
          ? openService
          : 0;

  const renderLink = (link: NavLink, nested: boolean) => {
    const active = isActive(link.href, link.exact);
    const count = badgeCount(link.badge);
    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2 rounded-xl py-2 pr-3 text-sm font-medium transition-colors ${
          nested ? "pl-7" : "pl-3"
        } ${active ? "bg-brand-700 text-white" : "text-brand-600 hover:bg-brand-100"}`}
      >
        {link.label}
        {count > 0 && (
          <span
            className={`badge tnum ${
              active ? "bg-white text-brand-800" : "bg-amber-400 text-amber-950"
            }`}
          >
            {count}
          </span>
        )}
      </Link>
    );
  };

  const renderGroup = (group: NavGroup) => {
    const containsActive = group.links.some((link) => isActive(link.href, link.exact));
    const expanded = toggled[group.label] ?? containsActive;
    return (
      <div key={group.label}>
        <button
          type="button"
          onClick={() => setToggled((current) => ({ ...current, [group.label]: !expanded }))}
          aria-expanded={expanded}
          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-brand-100 ${
            containsActive ? "text-brand-900" : "text-brand-600"
          }`}
        >
          {group.label}
          <ChevronDownIcon
            className={`ml-auto h-4 w-4 text-brand-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        {expanded && (
          <div className="mt-0.5 flex flex-col gap-0.5">
            {group.links.map((link) => renderLink(link, true))}
          </div>
        )}
      </div>
    );
  };

  const links = NAV.map((item) => (isGroup(item) ? renderGroup(item) : renderLink(item, false)));

  const account = (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href="/"
        target="_blank"
        rel="noopener"
        className="text-xs text-brand-400 hover:text-brand-800"
      >
        Открыть сайт ↗
      </a>
      <span className="text-xs text-brand-300">{login}</span>
      <form action={logoutAction} className="ml-auto">
        <button type="submit" className="btn-ghost px-3 py-1.5 text-xs">
          Выйти
        </button>
      </form>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-brand-100 bg-white lg:flex">
        <Link href="/admin/" className="px-5 py-4 text-sm font-semibold text-brand-900">
          {siteName}
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">{links}</nav>
        <div className="border-t border-brand-100 px-4 py-3">{account}</div>
      </aside>

      <header className="sticky top-0 z-40 border-b border-brand-100 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/admin/" className="shrink-0 text-sm font-semibold text-brand-900">
            {siteName}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
            className="btn-ghost ml-auto px-2 py-1.5"
          >
            {open ? (
              <CloseIcon className="h-5 w-5" />
            ) : (
              <MenuIcon className="h-5 w-5" />
            )}
          </button>
        </div>

        {open && (
          <div className="space-y-3 border-t border-brand-100 px-4 py-3">
            <nav className="grid gap-1">{links}</nav>
            {account}
          </div>
        )}
      </header>
    </>
  );
}
