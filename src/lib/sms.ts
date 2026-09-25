import { env } from "./env.mjs";

const API_URL = "https://app.sms.by/api/v1";
const TIMEOUT_MS = 15000;

export class SmsError extends Error {}

export function smsConfigured(): boolean {
  return Boolean(env("SMS_BY_TOKEN", ""));
}

export async function sendSms(phone: string, message: string): Promise<string> {
  const token = env("SMS_BY_TOKEN", "");
  if (!token) throw new SmsError("SMS не настроены: на сервере не задан SMS_BY_TOKEN");

  const query = new URLSearchParams({ token, message, phone });
  const alphaname = env("SMS_BY_ALPHANAME_ID", "");
  if (alphaname) query.set("alphaname_id", alphaname);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/sendQuickSMS?${query.toString()}`, {
      method: "POST",
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

  const id = (body as { sms_id?: string | number }).sms_id;
  return id != null ? String(id) : "";
}
