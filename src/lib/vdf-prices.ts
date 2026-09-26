import { revalidatePath } from "next/cache";

import { invalidateCatalog } from "./catalog";
import { convertToByn } from "./currency";
import { bumpCatalogVersion, getDb } from "./db";
import { getRubRate } from "./rates";
import type { Product } from "./schema";
import { VDF_FRAME_ROOT, VDF_ORIGIN } from "./vdf-frames";

const SESSION_KEY = "vdf:session";
const REPORT_KEY = "vdf:prices:report";
const LOCK_KEY = "vdf:prices:lock";
const AUTH = `${VDF_ORIGIN}/api/auth`;
const PAGE_SIZE = 24;
const PAGE_PAUSE_MS = 700;
const CAPTCHA_PAUSE_MS = 30000;
const ATTEMPTS = 4;
const LOCK_TTL_MS = 15 * 60 * 1000;
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

export class VdfAuthError extends Error {}

interface VdfSession {
  refresh: string;
  email: string;
  wholesale: boolean;
  savedAt: number;
}

export interface VdfPriceReport {
  at: number;
  ok: boolean;
  error: string;
  rate: number;
  rateDate: string;
  listed: number;
  matched: number;
  updated: number;
  withoutWholesale: string[];
  missingOnVdf: string[];
  notInShop: string[];
}

export interface VdfPriceStatus {
  email: string | null;
  wholesale: boolean;
  running: boolean;
  report: VdfPriceReport | null;
}

interface ListedFrame {
  article: string;
  modelFrame: string;
  retail: number;
  wholesale: number | null;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readSetting<T>(key: string): T | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

function writeSetting(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, JSON.stringify(value));
}

function removeSetting(key: string): void {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

export function vdfPriceStatus(): VdfPriceStatus {
  const session = readSetting<VdfSession>(SESSION_KEY);
  const lock = readSetting<number>(LOCK_KEY);
  return {
    email: session?.email ?? null,
    wholesale: session?.wholesale ?? false,
    running: lock !== null && Date.now() - lock < LOCK_TTL_MS,
    report: readSetting<VdfPriceReport>(REPORT_KEY),
  };
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT, Origin: VDF_ORIGIN },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = String(data.error ?? data.detail ?? `vdf-light ответил ${response.status}`);
    throw new VdfAuthError(message);
  }
  return data;
}

export async function requestVdfCode(email: string): Promise<number> {
  const data = await postJson(`${AUTH}/otp/request/`, { identifier: email });
  return Number(data.expires_in) || 900;
}

export async function verifyVdfCode(email: string, code: string): Promise<VdfSession> {
  const data = await postJson(`${AUTH}/otp/verify/`, { identifier: email, code });
  const user = (data.user ?? {}) as Record<string, unknown>;
  if (typeof data.refresh_token !== "string") throw new VdfAuthError("vdf-light не выдал вход");
  const session: VdfSession = {
    refresh: data.refresh_token,
    email: String(user.email ?? email),
    wholesale: user.is_wholesale === true,
    savedAt: Date.now(),
  };
  writeSetting(SESSION_KEY, session);
  return session;
}

export function forgetVdfSession(): void {
  removeSetting(SESSION_KEY);
}

const ACCESS_MARGIN_MS = 3 * 60 * 1000;

let cachedAccess: { token: string; expiresAt: number; refresh: string } | null = null;
let refreshing: Promise<string> | null = null;

function expiryOf(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return Number(payload.exp) * 1000 || Date.now() + 5 * 60 * 1000;
  } catch {
    return Date.now() + 5 * 60 * 1000;
  }
}

export function accessToken(): Promise<string> {
  const session = readSetting<VdfSession>(SESSION_KEY);
  if (!session) return Promise.reject(new VdfAuthError("Нет входа на vdf-light.ru — войдите по коду из почты"));
  if (
    cachedAccess &&
    cachedAccess.refresh === session.refresh &&
    cachedAccess.expiresAt - ACCESS_MARGIN_MS > Date.now()
  ) {
    return Promise.resolve(cachedAccess.token);
  }
  refreshing ??= renewAccess(session).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function renewAccess(session: VdfSession): Promise<string> {
  let data: Record<string, unknown>;
  try {
    data = await postJson(`${AUTH}/token/refresh/`, { refresh: session.refresh });
  } catch (error) {
    throw new VdfAuthError(
      `Вход на vdf-light.ru больше не действует (${(error as Error).message}) — войдите заново`,
    );
  }
  if (typeof data.access !== "string") throw new VdfAuthError("vdf-light не продлил вход");
  const refresh = typeof data.refresh === "string" ? data.refresh : session.refresh;
  if (refresh !== session.refresh) {
    writeSetting(SESSION_KEY, { ...session, refresh, savedAt: Date.now() });
  }
  cachedAccess = { token: data.access, expiresAt: expiryOf(data.access), refresh };
  return data.access;
}

export async function fetchPage(url: string, token: string): Promise<Record<string, unknown>> {
  let lastError = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      });
      if (response.ok) return (await response.json()) as Record<string, unknown>;
      lastError = `HTTP ${response.status}`;
      await response.body?.cancel();
      if (response.status === 401) throw new VdfAuthError("vdf-light не принял вход");
      if (response.status === 429) {
        await pause(CAPTCHA_PAUSE_MS * attempt);
        continue;
      }
    } catch (error) {
      if (error instanceof VdfAuthError) throw error;
      lastError = (error as Error).message;
    }
    await pause(3000 * attempt);
  }
  throw new Error(`Не удалось получить список с vdf-light.ru: ${lastError}`);
}

function articleFromUrl(url: string): string {
  const match = url.match(/\/product\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]).trim() : "";
}

async function listVdfFrames(token: string): Promise<ListedFrame[]> {
  const frames: ListedFrame[] = [];
  let url: string | null =
    `${VDF_ORIGIN}/api/products/?category_slug=${VDF_FRAME_ROOT}&page=1&page_size=${PAGE_SIZE}`;
  while (url) {
    const page = await fetchPage(url, token);
    for (const raw of (page.results ?? []) as Array<Record<string, unknown>>) {
      const price = (raw.price ?? {}) as Record<string, unknown>;
      const wholesale = Number(price.person_price);
      frames.push({
        article: articleFromUrl(String(raw.url ?? "")),
        modelFrame: String(raw.model_frame ?? "").trim(),
        retail: Number(price.retail_price) || 0,
        wholesale: Number.isFinite(wholesale) && wholesale > 0 ? wholesale : null,
      });
    }
    const next = typeof page.next === "string" ? new URL(page.next) : null;
    url = next ? `${VDF_ORIGIN}${next.pathname}${next.search}` : null;
    if (url) await pause(PAGE_PAUSE_MS);
  }
  return frames;
}

function applyPrices(frames: ListedFrame[], rate: number) {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, data, json_extract(data, '$.sku') AS sku FROM products WHERE json_extract(data, '$.sku') IS NOT NULL",
    )
    .all() as Array<{ id: string; data: string; sku: string }>;
  const bySku = new Map(rows.map((row) => [row.sku, row]));
  const imported = new Set(
    (
      db.prepare("SELECT product_id FROM vdf_frames WHERE product_id IS NOT NULL").all() as Array<{
        product_id: string;
      }>
    ).map((row) => row.product_id),
  );

  const write = db.prepare("UPDATE products SET price = ?, data = ?, updated_at = ? WHERE id = ?");
  const seen = new Set<string>();
  const withoutWholesale: string[] = [];
  const notInShop: string[] = [];
  let updated = 0;

  db.transaction(() => {
    for (const frame of frames) {
      const row = bySku.get(frame.article) ?? bySku.get(frame.modelFrame);
      if (!row) {
        notInShop.push(frame.article || frame.modelFrame);
        continue;
      }
      if (seen.has(row.id)) continue;
      seen.add(row.id);

      const product = JSON.parse(row.data) as Product;
      const next: Product = { ...product };
      if (frame.retail > 0) {
        next.priceSource = { amount: frame.retail, currency: "RUB" };
        next.price = convertToByn(frame.retail, rate, "ruble");
      }
      if (frame.wholesale) {
        next.costSource = { amount: frame.wholesale, currency: "RUB" };
        next.costPrice = convertToByn(frame.wholesale, rate, "kopeck");
      } else {
        withoutWholesale.push(row.sku);
      }
      if (JSON.stringify(next) === JSON.stringify(product)) continue;
      write.run(next.price, JSON.stringify(next), Date.now(), row.id);
      updated += 1;
    }
  })();

  const missingOnVdf = rows
    .filter((row) => imported.has(row.id) && !seen.has(row.id))
    .map((row) => row.sku)
    .sort();

  return { matched: seen.size, updated, withoutWholesale, missingOnVdf, notInShop };
}

export async function loadVdfPrices(): Promise<VdfPriceReport> {
  const lock = readSetting<number>(LOCK_KEY);
  if (lock !== null && Date.now() - lock < LOCK_TTL_MS) {
    throw new Error("Загрузка цен уже идёт — дождитесь окончания");
  }
  writeSetting(LOCK_KEY, Date.now());

  const report: VdfPriceReport = {
    at: Date.now(),
    ok: false,
    error: "",
    rate: 0,
    rateDate: "",
    listed: 0,
    matched: 0,
    updated: 0,
    withoutWholesale: [],
    missingOnVdf: [],
    notInShop: [],
  };

  try {
    const rub = await getRubRate();
    if (!rub) throw new Error("Не удалось получить курс российского рубля с api.nbrb.by");
    report.rate = rub.rate;
    report.rateDate = rub.date;

    const frames = await listVdfFrames(await accessToken());
    report.listed = frames.length;
    if (!frames.length) throw new Error("vdf-light.ru вернул пустой список рамок");

    Object.assign(report, applyPrices(frames, rub.rate));

    if (report.updated) {
      bumpCatalogVersion();
      invalidateCatalog();
      revalidatePath("/", "layout");
    }
    report.ok = true;
  } catch (error) {
    report.error = (error as Error).message;
  } finally {
    report.at = Date.now();
    writeSetting(REPORT_KEY, report);
    removeSetting(LOCK_KEY);
  }
  return report;
}
