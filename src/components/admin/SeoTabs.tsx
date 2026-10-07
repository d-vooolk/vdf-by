import Link from "next/link";

const TABS = [
  { href: "/admin/seo/", label: "Обзор", id: "overview" },
  { href: "/admin/seo/keywords/", label: "Ключевые фразы", id: "keywords" },
] as const;

export type SeoTab = (typeof TABS)[number]["id"];

export function SeoTabs({ active }: { active: SeoTab }) {
  return (
    <nav className="mt-3 flex flex-wrap gap-1 border-b border-brand-100" aria-label="Разделы SEO">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={active === tab.id ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            active === tab.id
              ? "border-brand-700 text-brand-900"
              : "border-transparent text-brand-500 hover:text-brand-800"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
