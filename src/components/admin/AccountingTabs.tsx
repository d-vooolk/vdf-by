import Link from "next/link";

const TABS = [
  { href: "/admin/accounting/staff-orders/", label: "Заказы сотрудников", id: "staff-orders" },
  { href: "/admin/accounting/own-orders/", label: "Собственные заказы", id: "own-orders" },
] as const;

export type AccountingTab = (typeof TABS)[number]["id"];

export function AccountingTabs({ active }: { active: AccountingTab }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Разделы бухгалтерии">
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
