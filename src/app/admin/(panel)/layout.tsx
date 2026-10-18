import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";

import { AdminNav } from "@/components/admin/AdminNav";
import { NavigationOverlay } from "@/components/admin/NavigationOverlay";
import { ADMIN_THEME_COOKIE, BOTTOM_NAV_COOKIE, parseAdminTheme, parseBottomNav } from "@/lib/admin-prefs";
import { countOpenServiceRequests } from "@/lib/service";
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
  const store = await cookies();
  const theme = parseAdminTheme(store.get(ADMIN_THEME_COOKIE)?.value);

  return (
    <div data-admin-theme={theme} className="admin-panel flex min-h-dvh flex-col bg-brand-50 lg:flex-row">
      <AdminNav
        siteName={site.name}
        login={admin.login}
        newOrders={newCount}
        pendingWholesale={countPendingWholesale()}
        openService={countOpenServiceRequests()}
        theme={theme}
        bottomNav={parseBottomNav(store.get(BOTTOM_NAV_COOKIE)?.value)}
      />
      <Suspense fallback={null}>
        <NavigationOverlay />
      </Suspense>
      <main className="admin-main min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto w-full max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
