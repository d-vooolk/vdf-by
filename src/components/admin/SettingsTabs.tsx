import Link from "next/link";

const TABS = [
  { href: "/admin/settings/", label: "Сайт", id: "site" },
  { href: "/admin/settings/sms/", label: "SMS", id: "sms" },
] as const;

export function SettingsTabs({ active }: { active: (typeof TABS)[number]["id"] }) {
  return (
    <nav className="mb-5 flex gap-2" aria-label="Разделы настроек">
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
