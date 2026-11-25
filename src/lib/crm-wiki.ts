import { getCustomer } from "./customer-auth";
import { isWholesale, type Customer } from "./customers";
import { env } from "./env.mjs";

export class CrmWikiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 10 * 60_000;

function crmConfig(): { url: string; key: string } {
  const url = env("CRM_URL", undefined);
  const key = env("CRM_INTEGRATION_KEY", undefined);
  if (!url || !key) throw new CrmWikiError("Вики временно недоступна", 503);
  return { url: url.replace(/\/+$/, ""), key };
}

export async function wikiCustomer(): Promise<Customer | null> {
  const customer = await getCustomer();
  return customer && isWholesale(customer) ? customer : null;
}

function customerHeaders(customer: Customer): Record<string, string> {
  return {
    "x-vdf-customer-id": String(customer.id),
    "x-vdf-customer-name": encodeURIComponent(customer.name.trim() || `Покупатель ${customer.id}`),
    "x-vdf-customer-phone": encodeURIComponent(customer.phone),
  };
}

interface CallOptions {
  method?: string;
  query?: Record<string, string>;
  json?: unknown;
  body?: BodyInit;
  contentType?: string;
}

async function call(path: string, customer: Customer | null, options: CallOptions = {}): Promise<Response> {
  const { url, key } = crmConfig();
  const query = options.query ? `?${new URLSearchParams(options.query)}` : "";
  const headers: Record<string, string> = {
    "x-integration-key": key,
    ...(customer ? customerHeaders(customer) : {}),
  };
  let body: BodyInit | undefined = options.body;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (options.contentType) {
    headers["Content-Type"] = options.contentType;
  }
  const streaming = body instanceof ReadableStream;
  try {
    return await fetch(`${url}${path}${query}`, {
      method: options.method ?? "GET",
      headers,
      body,
      signal: AbortSignal.timeout(streaming ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS),
      cache: "no-store",
      ...(streaming ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch (error) {
    console.error("[crm-wiki]", path, (error as Error).message);
    throw new CrmWikiError("Вики не отвечает — попробуйте ещё раз", 502);
  }
}

export async function crmWiki<T>(path: string, customer: Customer | null, options: CallOptions = {}): Promise<T> {
  const response = await call(`/api/integrations/vdf/wiki${path}`, customer, options);
  const payload = (await response.json().catch(() => ({}))) as { data?: T; error?: unknown; message?: string };
  if (!response.ok) {
    const detail = payload.message ?? (typeof payload.error === "string" ? payload.error : undefined);
    const message = response.status === 401 ? "Вики временно недоступна" : detail;
    throw new CrmWikiError(message || `Ошибка ${response.status}`, response.status >= 500 ? 502 : response.status);
  }
  return payload.data as T;
}

export async function crmCars<T>(path: string): Promise<T> {
  const response = await call(`/api/cars${path}`, null);
  if (!response.ok) throw new CrmWikiError("Справочник машин недоступен", 502);
  return (await response.json()) as T;
}

export function crmCarPhoto(path: string): Promise<Response> {
  return call(`/api/cars/photo/${path}`, null);
}

export async function crmUpload(path: string, range: string | null): Promise<Response> {
  const { url } = crmConfig();
  try {
    return await fetch(`${url}/api/uploads/wiki/${path}`, {
      headers: range ? { Range: range } : {},
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new CrmWikiError("Файл недоступен", 502);
  }
}

export function crmWikiRaw(path: string, customer: Customer, options: CallOptions): Promise<Response> {
  return call(`/api/integrations/vdf/wiki${path}`, customer, options);
}

export function wikiErrorResponse(error: unknown): Response {
  if (error instanceof CrmWikiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("[crm-wiki]", error);
  return Response.json({ error: "Что-то пошло не так — попробуйте ещё раз" }, { status: 500 });
}

export const forbidden = () =>
  Response.json({ error: "Вики доступна только оптовым покупателям" }, { status: 403 });
