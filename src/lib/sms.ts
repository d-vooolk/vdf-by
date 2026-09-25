import { getDb } from "./db";
import { env } from "./env.mjs";

const API_URL = "https://app.sms.by/api/v1";
const TIMEOUT_MS = 15000;
const SETTINGS_KEY = "sms:settings";

export class SmsError extends Error {}

export interface SmsSettings {
  enabled: boolean;
  token: string;
  alphanameId: string;
  alphaname: string;
  codeTemplate: string;
  approvedTemplate: string;
}

export const DEFAULT_TEMPLATES = {
  codeTemplate: "Код для входа на {{siteName}}: {{code}}",
  approvedTemplate:
    "{{name}}, оптовые цены на {{siteName}} открыты. Войдите в личный кабинет по номеру телефона.",
};

export const TEMPLATE_VARIABLES: Record<keyof typeof DEFAULT_TEMPLATES, Array<[string, string]>> = {
  codeTemplate: [
    ["{{code}}", "код из шести цифр"],
    ["{{siteName}}", "название магазина"],
  ],
  approvedTemplate: [
    ["{{name}}", "ФИО или компания покупателя"],
    ["{{siteName}}", "название магазина"],
  ],
};

export function getSmsSettings(): SmsSettings {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY) as
    | { value: string }
    | undefined;
  const saved = row ? (JSON.parse(row.value) as Partial<SmsSettings>) : null;
  const envToken = env("SMS_BY_TOKEN", "");
  return {
    enabled: saved ? saved.enabled === true : Boolean(envToken),
    token: saved?.token || envToken,
    alphanameId: saved?.alphanameId ?? env("SMS_BY_ALPHANAME_ID", ""),
    alphaname: saved?.alphaname ?? "",
    codeTemplate: saved?.codeTemplate?.trim() || DEFAULT_TEMPLATES.codeTemplate,
    approvedTemplate: saved?.approvedTemplate?.trim() || DEFAULT_TEMPLATES.approvedTemplate,
  };
}

export function saveSmsSettings(input: Partial<SmsSettings>): SmsSettings {
  const current = getSmsSettings();
  const next: SmsSettings = {
    enabled: input.enabled === true,
    token: input.token?.trim() || current.token,
    alphanameId: input.alphanameId?.trim() ?? current.alphanameId,
    alphaname: input.alphaname?.trim() ?? current.alphaname,
    codeTemplate: input.codeTemplate?.trim() || DEFAULT_TEMPLATES.codeTemplate,
    approvedTemplate: input.approvedTemplate?.trim() || DEFAULT_TEMPLATES.approvedTemplate,
  };
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function maskToken(token: string): string {
  if (!token) return "";
  return token.length <= 8 ? "••••" : `${token.slice(0, 4)}••••${token.slice(-4)}`;
}

export function smsConfigured(): boolean {
  const settings = getSmsSettings();
  return settings.enabled && Boolean(settings.token);
}

export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => values[name] ?? match);
}

async function request<T>(
  command: string,
  token: string,
  params: Record<string, string> = {},
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const query = new URLSearchParams({ token, ...params });
  let response: Response;
  try {
    response = await fetch(`${API_URL}/${command}?${query.toString()}`, {
      method,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new SmsError(`sms.by не ответил: ${(error as Error).message}`);
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new SmsError(`sms.by вернул некорректный ответ (HTTP ${response.status})`);
  }
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error: unknown }).error;
    throw new SmsError(typeof error === "string" ? error : JSON.stringify(error));
  }
  if (!response.ok) throw new SmsError(`sms.by вернул HTTP ${response.status}`);
  return body as T;
}

export interface SmsConnection {
  balance: number;
  currency: string;
  alphanames: Array<{ id: string; name: string }>;
}

export async function checkSmsConnection(token: string): Promise<SmsConnection> {
  if (!token) throw new SmsError("Укажите API-токен sms.by");
  const balance = await request<{ currency?: string; result?: Array<{ balance?: number | string }> }>(
    "getBalance",
    token,
  );
  let alphanames: SmsConnection["alphanames"] = [];
  try {
    const names = await request<Record<string, string>>("getAlphanames", token);
    alphanames = Object.entries(names ?? {}).map(([id, name]) => ({ id, name: String(name) }));
  } catch {
    alphanames = [];
  }
  return {
    balance: Number(balance.result?.[0]?.balance ?? 0),
    currency: balance.currency || "BYN",
    alphanames,
  };
}

export async function sendSms(phone: string, message: string): Promise<string> {
  const settings = getSmsSettings();
  if (!settings.enabled) throw new SmsError("Отправка SMS выключена в настройках");
  if (!settings.token) throw new SmsError("SMS не настроены: не задан токен sms.by");

  const params: Record<string, string> = { message, phone };
  if (settings.alphanameId) params.alphaname_id = settings.alphanameId;
  const data = await request<{ sms_id?: string | number }>("sendQuickSMS", settings.token, params, "POST");
  return data.sms_id != null ? String(data.sms_id) : "";
}

export interface SmsLogEntry {
  id: number;
  createdAt: number;
  phone: string;
  purpose: string;
  sent: boolean;
  used: boolean;
  error: string;
}

export function recentSms(limit = 30): SmsLogEntry[] {
  return (
    getDb()
      .prepare(
        `SELECT id, created_at AS createdAt, phone, purpose, sent, used, error
           FROM sms_codes ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as Array<Omit<SmsLogEntry, "sent" | "used"> & { sent: number; used: number }>
  ).map((row) => ({ ...row, sent: row.sent === 1, used: row.used === 1 }));
}
