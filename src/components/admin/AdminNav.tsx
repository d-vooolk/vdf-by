"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { logoutAction } from "@/app/admin/actions";
import { CloseIcon, MenuIcon } from "@/components/icons";

/**
 * Шапка админки: разделы, счётчик новых заказов, выход.
 *
 * Клиентский компонент только ради подсветки текущего раздела и меню на
 * телефоне — данные приходят готовыми из макета.
 */

const LINKS = [
  { href: "/admin/", label: "Сводка", exact: true },
  { href: "/admin/products/", label: "Товары" },
  { href: "/admin/incomplete/", label: "Незаполненные" },
  { href: "/admin/frame-types/", label: "Типы рамок" },
  { href: "/admin/frames/", label: "Импорт рамок" },
  { href: "/admin/categories/", label: "Разделы" },
  { href: "/admin/cars/", label: "Автомобили" },
  { href: "/admin/orders/", label: "Заказы", badge: "orders" },
  { href: "/admin/customers/", label: "Покупатели", badge: "customers" },
  { href: "/admin/media/", label: "Фото" },
  { href: "/admin/ai/", label: "Нейросеть" },
  { href: "/admin/settings/", label: "Настройки" },
];

interface AdminNavProps {
  siteName: string;
  login: string;
  newOrders: number;
  pendingWholesale: number;
}

export function AdminNav({ siteName, login, newOrders, pendingWholesale }: AdminNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href.replace(/\/$/, "") || pathname === href
      : pathname.startsWith(href.replace(/\/$/, ""));

  const links = LINKS.map((link) => {
    const active = isActive(link.href, link.exact);
    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? "bg-brand-700 text-white"
            : "text-brand-600 hover:bg-brand-100"
        }`}
      >
        {link.label}
        {link.badge && (link.badge === "orders" ? newOrders : pendingWholesale) > 0 && (
          <span
            className={`badge tnum ${
              active ? "bg-white text-brand-800" : "bg-amber-400 text-amber-950"
            }`}
          >
            {link.badge === "orders" ? newOrders : pendingWholesale}
          </span>
        )}
      </Link>
    );
  });

  return (
    <header className="sticky top-0 z-40 border-b border-brand-100 bg-white/95 backdrop-blur">
      <div className="container-page flex h-14 items-center gap-3">
        <Link href="/admin/" className="shrink-0 text-sm font-semibold text-brand-900">
          {siteName}
        </Link>

        <nav className="hidden flex-1 items-center gap-1 lg:flex">{links}</nav>

        <div className="ml-auto flex items-center gap-2">
          <a
            href="/"
            target="_blank"
            rel="noopener"
            className="hidden text-xs text-brand-400 hover:text-brand-800 sm:inline"
          >
            Открыть сайт ↗
          </a>
          <span className="hidden text-xs text-brand-300 sm:inline">{login}</span>
          <form action={logoutAction}>
            <button type="submit" className="btn-ghost px-3 py-1.5 text-xs">
              Выйти
            </button>
          </form>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
            className="btn-ghost px-2 py-1.5 lg:hidden"
          >
            {open ? (
              <CloseIcon className="h-5 w-5" />
            ) : (
              <MenuIcon className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {open && (
        <nav className="container-page grid gap-1 border-t border-brand-100 py-3 lg:hidden">
          {links}
        </nav>
      )}
    </header>
  );
}
