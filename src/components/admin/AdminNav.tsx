"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { logoutAction } from "@/app/admin/actions";
import { ChevronDownIcon, GridIcon, MoonIcon, SunIcon } from "@/components/icons";
import { ADMIN_THEME_COOKIE, writeAdminCookie, type AdminTheme } from "@/lib/admin-prefs";

import { bottomNavLinks, isGroup, NAV, NAV_LINKS, type NavGroup, type NavLink } from "./admin-nav-items";

/**
 * Шапка админки: разделы, счётчик новых заказов, выход.
 *
 * Клиентский компонент только ради подсветки текущего раздела и меню на
 * телефоне — данные приходят готовыми из макета.
 */

interface AdminNavProps {
  siteName: string;
  login: string;
  newOrders: number;
  pendingWholesale: number;
  openService: number;
  theme: AdminTheme;
  bottomNav: string[] | null;
}

export function AdminNav({
  siteName,
  login,
  newOrders,
  pendingWholesale,
  openService,
  theme,
  bottomNav,
}: AdminNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

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

  const switchTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    writeAdminCookie(ADMIN_THEME_COOKIE, next);
    document.querySelector("[data-admin-theme]")?.setAttribute("data-admin-theme", next);
    router.refresh();
  };

  const bottomLinks = bottomNavLinks(bottomNav);
  const moreLinks = NAV_LINKS.filter((link) => !bottomLinks.includes(link));
  const moreActive = moreLinks.some((link) => isActive(link.href, link.exact));
  const moreCount = moreLinks.reduce((sum, link) => sum + badgeCount(link.badge), 0);

  const renderLink = (link: NavLink, nested: boolean) => {
    const active = isActive(link.href, link.exact);
    const count = badgeCount(link.badge);
    return (
      <Link
        key={link.href}
        href={link.href}
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
        <div className="flex h-12 items-center gap-3 px-4">
          <Link href="/admin/" className="min-w-0 truncate text-sm font-semibold text-brand-900">
            {siteName}
          </Link>
          <button
            type="button"
            onClick={switchTheme}
            aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
            title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
            className="btn-ghost ml-auto p-2"
          >
            {theme === "dark" ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        aria-hidden={!open}
        inert={!open}
        className={`admin-more-sheet fixed inset-x-0 z-40 max-h-[70dvh] overflow-y-auto rounded-t-3xl border-t border-brand-100 bg-white px-3 pt-3 pb-4 shadow-pop transition-transform duration-300 lg:hidden ${
          open ? "translate-y-0" : "translate-y-[calc(100%+5rem)]"
        }`}
      >
        <nav className="grid gap-0.5">
          {moreLinks.map((link) => {
            const active = isActive(link.href, link.exact);
            const count = badgeCount(link.badge);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center gap-3.5 rounded-xl px-3 text-base ${
                  active ? "bg-brand-100 font-semibold text-brand-900" : "text-brand-700"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0 text-brand-500" />
                <span className="flex-1">{link.label}</span>
                {count > 0 && <span className="badge tnum bg-amber-400 text-amber-950">{count}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-3 border-t border-brand-100 px-3 pt-3">{account}</div>
      </div>

      <nav aria-label="Основные разделы" className="admin-bottom-nav lg:hidden">
        {bottomLinks.map((link) => {
          const active = isActive(link.href, link.exact) && !open;
          const count = badgeCount(link.badge);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`admin-bottom-item ${active ? "is-active" : ""}`}
            >
              <span className="relative">
                <Icon className="h-[22px] w-[22px]" />
                {count > 0 && <span className="admin-bottom-badge tnum">{count}</span>}
              </span>
              <span className="max-w-full truncate px-0.5">{link.label}</span>
            </Link>
          );
        })}
        {moreLinks.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className={`admin-bottom-item ${moreActive || open ? "is-active" : ""}`}
          >
            <span className="relative">
              <GridIcon className="h-[22px] w-[22px]" />
              {moreCount > 0 && !open && <span className="admin-bottom-badge tnum">{moreCount}</span>}
            </span>
            <span>Ещё</span>
          </button>
        )}
      </nav>
    </>
  );
}
