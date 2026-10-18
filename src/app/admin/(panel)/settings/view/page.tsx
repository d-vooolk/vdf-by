import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AdminViewSettings } from "@/components/admin/AdminViewSettings";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { ADMIN_THEME_COOKIE, BOTTOM_NAV_COOKIE, parseAdminTheme, parseBottomNav } from "@/lib/admin-prefs";

export const metadata: Metadata = { title: "Вид админки" };

export default async function AdminViewPage() {
  const store = await cookies();
  return (
    <>
      <SettingsTabs active="view" />
      <div className="space-y-5">
        <h1 className="text-xl font-semibold text-brand-900">Вид админки</h1>
        <AdminViewSettings
          theme={parseAdminTheme(store.get(ADMIN_THEME_COOKIE)?.value)}
          bottomNav={parseBottomNav(store.get(BOTTOM_NAV_COOKIE)?.value)}
        />
      </div>
    </>
  );
}
