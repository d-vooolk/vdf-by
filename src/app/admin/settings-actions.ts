"use server";

import { invalidateCatalog } from "@/lib/catalog";
import { revalidateSite } from "@/lib/revalidate";
import { saveSite } from "@/lib/site-store";
import {
  escapeTelegram,
  getTelegramSettings,
  saveTelegramSettings,
  sendTelegramTo,
  telegramBot,
  telegramChats,
  type TelegramBot,
  type TelegramChat,
  type TelegramSettings,
} from "@/lib/telegram";
import { getSite } from "@/lib/catalog";
import {
  checkSmsConnection,
  getSmsSettings,
  saveSmsSettings,
  sendSms,
  type SmsConnection,
  type SmsSettings,
} from "@/lib/sms";
import { normalizePhone } from "@/lib/phone";
import { requireAdmin } from "@/lib/auth";
import { fail, type FormState, ok, toState } from "./form-state";

/* ------------------------------------------------------------------ */
/* Настройки сайта                                                     */
/* ------------------------------------------------------------------ */

export async function saveSiteAction(input: unknown): Promise<FormState> {
  await requireAdmin();

  const result = saveSite(input);
  if (!result.ok) return toState(result);

  invalidateCatalog();
  revalidateSite();

  return ok();
}

export async function saveSmsSettingsAction(input: Partial<SmsSettings>): Promise<FormState> {
  await requireAdmin();
  saveSmsSettings({
    enabled: input.enabled === true,
    token: typeof input.token === "string" ? input.token : "",
    alphanameId: typeof input.alphanameId === "string" ? input.alphanameId : "",
    alphaname: typeof input.alphaname === "string" ? input.alphaname : "",
    codeTemplate: typeof input.codeTemplate === "string" ? input.codeTemplate : "",
    approvedTemplate: typeof input.approvedTemplate === "string" ? input.approvedTemplate : "",
    reviewTemplate: typeof input.reviewTemplate === "string" ? input.reviewTemplate : "",
    readyTemplate: typeof input.readyTemplate === "string" ? input.readyTemplate : "",
  });
  return ok();
}

export async function checkSmsAction(
  token: string,
): Promise<{ ok: true; info: SmsConnection } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    const info = await checkSmsConnection(token.trim() || getSmsSettings().token);
    return { ok: true, info };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function sendTestSmsAction(phone: string, message: string): Promise<FormState> {
  await requireAdmin();
  const digits = normalizePhone(phone);
  if (!digits) return fail(["Номер нужен белорусский: 375XXXXXXXXX"]);
  try {
    await sendSms(digits, message.trim() || `Тестовое сообщение от ${getSite().name}`);
    return ok();
  } catch (error) {
    return fail([(error as Error).message]);
  }
}

export async function saveTelegramSettingsAction(
  input: Partial<TelegramSettings>,
): Promise<FormState> {
  await requireAdmin();
  const next = {
    enabled: input.enabled === true,
    token: typeof input.token === "string" ? input.token : "",
    chatId: typeof input.chatId === "string" ? input.chatId : "",
    chatTitle: typeof input.chatTitle === "string" ? input.chatTitle : "",
  };
  const merged = { ...getTelegramSettings(), ...next, token: next.token.trim() || getTelegramSettings().token };
  if (merged.enabled && (!merged.token || !merged.chatId)) {
    return fail(["Чтобы включить отправку, нужны токен бота и чат"]);
  }
  saveTelegramSettings(next);
  return ok();
}

export type TelegramCheckResult =
  | { ok: true; bot: TelegramBot; chats: TelegramChat[] }
  | { ok: false; error: string };

export async function checkTelegramAction(token: string): Promise<TelegramCheckResult> {
  await requireAdmin();
  const key = token.trim() || getTelegramSettings().token;
  try {
    const bot = await telegramBot(key);
    const chats = await telegramChats(key);
    return { ok: true, bot, chats };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function sendTestTelegramAction(token: string, chatId: string): Promise<FormState> {
  await requireAdmin();
  const settings = getTelegramSettings();
  try {
    await sendTelegramTo(
      token.trim() || settings.token,
      chatId.trim() || settings.chatId,
      `✅ <b>${escapeTelegram(getSite().name)}</b>: бот подключён. Сюда будут приходить новые заказы.`,
    );
    return ok();
  } catch (error) {
    return fail([(error as Error).message]);
  }
}
