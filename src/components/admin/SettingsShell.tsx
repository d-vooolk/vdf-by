"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  ChatIcon,
  ChevronRightIcon,
  GearIcon,
  HomeIcon,
  PhoneIcon,
  SendIcon,
  SparkleListIcon,
  TruckIcon,
} from "@/components/icons";

const INDEX = "/admin/settings/";

const GROUPS = [
  {
    label: "Магазин",
    items: [
      { href: "/admin/settings/shop/", label: "Магазин", icon: HomeIcon },
      { href: "/admin/settings/contacts/", label: "Контакты", icon: PhoneIcon },
      { href: "/admin/settings/delivery/", label: "Доставка и оплата", icon: TruckIcon },
      { href: "/admin/settings/features/", label: "Преимущества", icon: SparkleListIcon },
    ],
  },
  {
    label: "Уведомления",
    items: [
      { href: "/admin/settings/telegram/", label: "Telegram", icon: SendIcon },
      { href: "/admin/settings/sms/", label: "SMS", icon: ChatIcon },
    ],
  },
  {
    label: "Админка",
    items: [{ href: "/admin/settings/view/", label: "Вид админки", icon: GearIcon }],
  },
];

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const isIndex = current === INDEX;
  const activeHref = isIndex ? GROUPS[0].items[0].href : current;

  return (
    <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start">
      <aside className={`${isIndex ? "" : "hidden"} lg:sticky lg:top-6 lg:block`}>
        <h1 className="mb-4 text-xl font-semibold text-brand-900 lg:hidden">Настройки</h1>
        <nav className="space-y-5" aria-label="Разделы настроек">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-[11px] font-bold tracking-[0.1em] text-brand-400 uppercase">
                {group.label}
              </p>
              <div className="grid gap-1.5 lg:gap-0.5">
                {group.items.map((item) => {
                  const active = item.href === activeHref;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-12 items-center gap-3 rounded-xl border px-3.5 text-base font-medium transition-colors lg:min-h-10 lg:border-transparent lg:text-sm ${
                        active
                          ? "border-brand-200 bg-white text-brand-900 lg:border-transparent lg:bg-brand-700 lg:text-white"
                          : "border-brand-100 bg-white text-brand-800 hover:bg-brand-50 lg:bg-transparent lg:text-brand-600 lg:hover:bg-brand-100"
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0 opacity-70 lg:h-4 lg:w-4" />
                      <span className="flex-1">{item.label}</span>
                      <ChevronRightIcon className="h-4 w-4 opacity-40 lg:hidden" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className={`${isIndex ? "hidden lg:block" : ""} min-w-0`}>
        <Link
          href={INDEX}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-900 lg:hidden"
        >
          <ChevronRightIcon className="h-4 w-4 rotate-180" />
          Настройки
        </Link>
        {children}
      </div>
    </div>
  );
}
