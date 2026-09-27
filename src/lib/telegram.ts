import { getDb } from "./db";
import { env } from "./env.mjs";

const API_URL = "https://api.telegram.org";
const TIMEOUT_MS = 8000;
const SETTINGS_KEY = "telegram:settings";

export class TelegramError extends Error {}

export interface TelegramSettings {
  enabled: boolean;
  token: string;
  chatId: string;
  chatTitle: string;
}

export interface TelegramChat {
  id: string;
  title: string;
  kind: string;
}

export interface TelegramBot {
  username: string;
  name: string;
}

export function escapeTelegram(text: string): string {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function getTelegramSettings(): TelegramSettings {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY) as
    | { value: string }
    | undefined;
  const saved = row ? (JSON.parse(row.value) as Partial<TelegramSettings>) : null;
  const envToken = env("TELEGRAM_BOT_TOKEN", "");
  const envChat = env("TELEGRAM_CHAT_ID", "");
  return {
    enabled: saved ? saved.enabled === true : Boolean(envToken && envChat),
    token: saved?.token || envToken,
    chatId: saved?.chatId || envChat,
    chatTitle: saved?.chatTitle ?? "",
  };
}

export function saveTelegramSettings(input: Partial<TelegramSettings>): TelegramSettings {
  const current = getTelegramSettings();
  const next: TelegramSettings = {
    enabled: input.enabled === true,
    token: input.token?.trim() || current.token,
    chatId: input.chatId?.trim() ?? current.chatId,
    chatTitle: input.chatTitle?.trim() ?? current.chatTitle,
  };
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function telegramConfigured(): boolean {
  const settings = getTelegramSettings();
  return settings.enabled && Boolean(settings.token && settings.chatId);
}

async function call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  if (!token) throw new TelegramError("Вставьте токен бота");
  let response: Response;
  try {
    response = await fetch(`${API_URL}/bot${token}/${method}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new TelegramError(`Telegram не ответил: ${(error as Error).message}`);
  }

  const data = (await response.json().catch(() => null)) as
    | { ok: boolean; result?: T; description?: string; error_code?: number }
    | null;
  if (!data) throw new TelegramError(`Telegram вернул некорректный ответ (HTTP ${response.status})`);
  if (!data.ok) {
    if (data.error_code === 401 || data.error_code === 404) {
      throw new TelegramError("Токен не подошёл — скопируйте его из @BotFather ещё раз");
    }
    if (data.error_code === 403) {
      throw new TelegramError("Бот не может писать в этот чат: напишите боту /start или добавьте его в группу");
    }
    if (data.error_code === 400 && /chat not found/i.test(data.description ?? "")) {
      throw new TelegramError("Чат не найден: напишите боту /start или добавьте его в группу");
    }
    throw new TelegramError(`Telegram: ${data.description ?? `ошибка ${data.error_code}`}`);
  }
  return data.result as T;
}

export async function telegramBot(token: string): Promise<TelegramBot> {
  const me = await call<{ username?: string; first_name?: string }>(token, "getMe");
  return { username: me.username ?? "", name: me.first_name ?? "" };
}

interface Update {
  message?: { chat: RawChat };
  my_chat_member?: { chat: RawChat };
  channel_post?: { chat: RawChat };
}

interface RawChat {
  id: number;
  type: string;
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

const CHAT_KINDS: Record<string, string> = {
  private: "личный чат",
  group: "группа",
  supergroup: "группа",
  channel: "канал",
};

export async function telegramChats(token: string): Promise<TelegramChat[]> {
  const updates = await call<Update[]>(token, "getUpdates", {
    allowed_updates: ["message", "my_chat_member", "channel_post"],
  });
  const chats = new Map<string, TelegramChat>();
  for (const update of updates) {
    const chat = update.message?.chat ?? update.my_chat_member?.chat ?? update.channel_post?.chat;
    if (!chat) continue;
    const name =
      chat.title ??
      ([chat.first_name, chat.last_name].filter(Boolean).join(" ") || (chat.username ? `@${chat.username}` : ""));
    chats.set(String(chat.id), {
      id: String(chat.id),
      title: name || String(chat.id),
      kind: CHAT_KINDS[chat.type] ?? chat.type,
    });
  }
  return [...chats.values()];
}

export async function sendTelegramTo(token: string, chatId: string, text: string): Promise<void> {
  if (!chatId) throw new TelegramError("Выберите чат, куда присылать заказы");
  await call(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

export async function sendTelegram(text: string): Promise<{ ok: boolean; reason?: string }> {
  const settings = getTelegramSettings();
  if (!settings.enabled || !settings.token || !settings.chatId) {
    return { ok: false, reason: "не настроен" };
  }
  try {
    await sendTelegramTo(settings.token, settings.chatId, text);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}
