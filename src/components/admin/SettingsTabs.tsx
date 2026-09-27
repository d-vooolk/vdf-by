import Link from "next/link";

const TABS = [
  { href: "/admin/settings/", label: "Магазин", id: "shop" },
  { href: "/admin/settings/contacts/", label: "Контакты", id: "contacts" },
  { href: "/admin/settings/delivery/", label: "Доставка и оплата", id: "delivery" },
  { href: "/admin/settings/features/", label: "Преимущества", id: "features" },
  { href: "/admin/settings/telegram/", label: "Telegram", id: "telegram" },
  { href: "/admin/settings/sms/", label: "SMS", id: "sms" },
] as const;

export type SettingsTab = (typeof TABS)[number]["id"];

export function SettingsTabs({ active }: { active: SettingsTab }) {
  return (
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Разделы настроек">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={active === tab.id ? "page" : undefined}
          className={`rounded-xl px-4 py-1.5 text-sm font-medium ${
            active === tab.id ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-700"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
