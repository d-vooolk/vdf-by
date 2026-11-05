import Link from "next/link";

import { isLiteMode } from "@/lib/lite-mode";

const TABS = [
  { href: "/admin/", label: "Общая", id: "overview" },
  { href: "/admin/traffic/", label: "Посещаемость", id: "traffic" },
  { href: "/admin/seo/", label: "SEO", id: "seo" },
] as const;

export type DashboardTab = (typeof TABS)[number]["id"];

export function DashboardTabs({ active }: { active: DashboardTab }) {
  const tabs = isLiteMode() ? TABS.filter((tab) => tab.id === "seo") : TABS;
  return (
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Разделы сводки">
      {tabs.map((tab) => (
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
