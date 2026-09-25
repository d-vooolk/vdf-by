import type { Metadata } from "next";

import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { SmsSettingsForm } from "@/components/admin/SmsSettingsForm";
import { formatPhone } from "@/lib/phone";
import {
  DEFAULT_TEMPLATES,
  getSmsSettings,
  maskToken,
  recentSms,
  TEMPLATE_VARIABLES,
} from "@/lib/sms";

export const metadata: Metadata = { title: "SMS" };

const PURPOSES: Record<string, string> = {
  register: "регистрация",
  login: "вход",
};

function time(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SmsSettingsPage() {
  const settings = getSmsSettings();
  const log = recentSms();

  return (
    <>
      <SettingsTabs active="sms" />
      <div className="space-y-5">
        <h1 className="text-xl font-semibold text-brand-900">SMS</h1>

        <SmsSettingsForm
          initial={{
            enabled: settings.enabled,
            alphanameId: settings.alphanameId,
            alphaname: settings.alphaname,
            codeTemplate: settings.codeTemplate,
            approvedTemplate: settings.approvedTemplate,
          }}
          tokenMask={maskToken(settings.token)}
          defaults={DEFAULT_TEMPLATES}
          variables={TEMPLATE_VARIABLES}
        />

        <section className="space-y-2">
          <h2 className="font-semibold text-brand-900">Последние коды</h2>
          {log.length === 0 ? (
            <p className="card p-8 text-center text-sm text-brand-400">Кодов ещё не отправляли.</p>
          ) : (
            <ul className="card divide-y divide-brand-100 text-sm">
              {log.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                  <span className="tnum w-24 text-brand-400">{time(entry.createdAt)}</span>
                  <span className="tnum w-40 text-brand-900">{formatPhone(entry.phone)}</span>
                  <span className="w-24 text-brand-500">{PURPOSES[entry.purpose] ?? entry.purpose}</span>
                  {entry.sent ? (
                    <span className="text-green-700">
                      отправлен{entry.used ? " · введён" : ""}
                    </span>
                  ) : (
                    <span className="text-red-700">не отправлен{entry.error ? `: ${entry.error}` : ""}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
