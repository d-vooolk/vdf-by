"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  ADMIN_THEME_COOKIE,
  ADMIN_THEMES,
  BOTTOM_NAV_COOKIE,
  BOTTOM_NAV_MAX,
  writeAdminCookie,
  type AdminTheme,
} from "@/lib/admin-prefs";

import { bottomNavLinks, NAV_LINKS } from "./admin-nav-items";

export function AdminViewSettings({ theme, bottomNav }: { theme: AdminTheme; bottomNav: string[] | null }) {
  const router = useRouter();
  const [currentTheme, setCurrentTheme] = useState(theme);
  const [chosen, setChosen] = useState<string[] | null>(bottomNav);
  const selected = bottomNavLinks(chosen).map((link) => link.href);
  const full = selected.length >= BOTTOM_NAV_MAX;

  const applyTheme = (next: AdminTheme) => {
    setCurrentTheme(next);
    writeAdminCookie(ADMIN_THEME_COOKIE, next);
    document.querySelector("[data-admin-theme]")?.setAttribute("data-admin-theme", next);
    router.refresh();
  };

  const applyNav = (next: string[] | null) => {
    setChosen(next);
    writeAdminCookie(BOTTOM_NAV_COOKIE, next ? next.join(",") : null);
    router.refresh();
  };

  const toggle = (href: string, on: boolean) => {
    const next = on ? [...selected, href] : selected.filter((path) => path !== href);
    applyNav(NAV_LINKS.map((link) => link.href).filter((path) => next.includes(path)));
  };

  return (
    <div className="space-y-5">
      <section className="card space-y-3 p-4">
        <div>
          <h2 className="text-sm font-bold text-brand-900">Тема</h2>
          <p className="mt-0.5 text-xs text-brand-500">
            Действует на телефоне и планшете. На компьютере админка всегда светлая.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ADMIN_THEMES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => applyTheme(option.id)}
              aria-pressed={currentTheme === option.id}
              className={`${currentTheme === option.id ? "btn-primary" : "btn-secondary"} py-2 text-sm`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-brand-900">Нижнее меню</h2>
            <p className="mt-0.5 text-xs text-brand-500">
              До {BOTTOM_NAV_MAX} разделов, остальные — в «Ещё». Выбрано {selected.length} из {BOTTOM_NAV_MAX}.
            </p>
          </div>
          {chosen && (
            <button type="button" onClick={() => applyNav(null)} className="btn-ghost px-3 py-1.5 text-xs">
              По умолчанию
            </button>
          )}
        </div>
        <ul className="grid gap-1 sm:grid-cols-2">
          {NAV_LINKS.map((link) => {
            const checked = selected.includes(link.href);
            const Icon = link.icon;
            return (
              <li key={link.href}>
                <label
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm ${
                    checked ? "bg-brand-100 text-brand-900" : "text-brand-700"
                  } ${!checked && full ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={checked ? selected.length === 1 : full}
                    onChange={(event) => toggle(link.href, event.target.checked)}
                    className="h-4 w-4 accent-current"
                  />
                  <Icon className="h-5 w-5 shrink-0 text-brand-500" />
                  {link.label}
                </label>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
