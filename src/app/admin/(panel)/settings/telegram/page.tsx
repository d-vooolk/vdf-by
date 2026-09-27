import type { Metadata } from "next";

import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { TelegramSettingsForm } from "@/components/admin/TelegramSettingsForm";
import { maskToken } from "@/lib/sms";
import { getTelegramSettings } from "@/lib/telegram";

export const metadata: Metadata = { title: "Telegram" };

export default function TelegramSettingsPage() {
  const settings = getTelegramSettings();

  return (
    <>
      <SettingsTabs active="telegram" />
      <div className="max-w-3xl space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-brand-900">Telegram</h1>
          <p className="mt-1 text-sm text-brand-500">
            Бот присылает каждый новый заказ и заявку на оптовые цены. Заказы сохраняются
            в админке в любом случае — бот только уведомляет.
          </p>
        </div>
        <TelegramSettingsForm
          initial={{
            enabled: settings.enabled,
            chatId: settings.chatId,
            chatTitle: settings.chatTitle,
          }}
          tokenMask={maskToken(settings.token)}
        />
      </div>
    </>
  );
}
