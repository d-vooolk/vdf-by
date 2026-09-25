import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/auth";
import { getSite } from "@/lib/catalog";
import { countPendingWholesale } from "@/lib/customers";
import { orderStats } from "@/lib/orders";

/**
 * Оболочка панели управления.
 *
 * Группа (panel) нужна ровно за этим: страница входа лежит рядом, в
 * /admin/login, но этот макет с его проверкой сессии не наследует. Иначе
 * requireAdmin() разворачивал бы на форму входа саму форму входа.
 */

export const metadata: Metadata = {
  title: { default: "Панель", template: "%s — панель" },
  robots: { index: false, follow: false },
};

// Админка показывает текущее состояние базы — кешировать её нечего и незачем.
export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const admin = await requireAdmin();
  const site = getSite();
  const { newCount } = orderStats();

  return (
    <div className="flex min-h-dvh flex-col bg-brand-50">
      <AdminNav
        siteName={site.name}
        login={admin.login}
        newOrders={newCount}
        pendingWholesale={countPendingWholesale()}
      />
      <main className="container-page flex-1 py-6 sm:py-8">{children}</main>
    </div>
  );
}
