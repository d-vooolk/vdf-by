import { SettingsForm, type SettingsPart } from "@/components/admin/SettingsForm";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { getSiteRaw } from "@/lib/store";

export function SiteSettingsPage({ part }: { part: SettingsPart }) {
  const site = getSiteRaw();

  if (!site) {
    return (
      <p className="card p-10 text-center text-sm text-brand-400">
        Настройки сайта не найдены. Залейте начальные данные командой{" "}
        <code className="rounded bg-brand-50 px-1">npm run import</code>.
      </p>
    );
  }

  return (
    <>
      <SettingsTabs active={part} />
      <SettingsForm key={part} site={site} part={part} />
    </>
  );
}
