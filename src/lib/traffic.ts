import fs from "node:fs";

import { DEFAULT_SEO_SOURCES } from "./seo-collect.mjs";
import { YANDEX_TOKEN_FILE } from "./seo-data";

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_MS = 5 * 60 * 1000;
const TOP_PAGES = 50;
const MAX_DAYS = 366;
const TIME_ZONE = "Europe/Minsk";

export interface TrafficRange {
  from: string;
  to: string;
}

export interface TrafficTotals {
  visits: number;
  users: number;
  pageviews: number;
}

export interface TrafficDay extends TrafficTotals {
  date: string;
}

export interface TrafficPage {
  path: string;
  pageviews: number;
  users: number;
}

export interface TrafficReport {
  range: TrafficRange;
  previous: TrafficRange;
  totals: TrafficTotals;
  previousTotals: TrafficTotals;
  days: TrafficDay[];
  pages: TrafficPage[];
  fetchedAt: number;
}

export type TrafficResult = { ok: true; report: TrafficReport } | { ok: false; error: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function minskDay(time: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(time);
}

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function spanDays(range: TrafficRange): number {
  return Math.round((Date.parse(range.to) - Date.parse(range.from)) / DAY_MS) + 1;
}

export const TRAFFIC_PRESETS = [
  { id: "today", label: "Сегодня" },
  { id: "yesterday", label: "Вчера" },
  { id: "7", label: "7 дней" },
  { id: "30", label: "30 дней" },
  { id: "90", label: "90 дней" },
] as const;

export type TrafficPreset = (typeof TRAFFIC_PRESETS)[number]["id"];

export function presetRange(preset: TrafficPreset): TrafficRange {
  const today = minskDay();
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const yesterday = shiftDay(today, -1);
    return { from: yesterday, to: yesterday };
  }
  return { from: shiftDay(today, -(Number(preset) - 1)), to: today };
}

export function parseRange(from: string | undefined, to: string | undefined): TrafficRange | null {
  if (!from || !to || !ISO_DAY.test(from) || !ISO_DAY.test(to)) return null;
  const today = minskDay();
  const end = to > today ? today : to;
  if (from > end) return null;
  const range = { from, to: end };
  return spanDays(range) > MAX_DAYS ? { from: shiftDay(end, -(MAX_DAYS - 1)), to: end } : range;
}

function previousRange(range: TrafficRange): TrafficRange {
  const days = spanDays(range);
  return { from: shiftDay(range.from, -days), to: shiftDay(range.from, -1) };
}

interface MetrikaBody {
  data?: Array<{ dimensions: Array<{ name?: string }>; metrics: number[] }>;
  totals?: number[];
  message?: string;
  errors?: Array<{ message?: string }>;
}

async function stat(token: string, range: TrafficRange, params: Record<string, string>): Promise<MetrikaBody> {
  const query = new URLSearchParams({
    ids: DEFAULT_SEO_SOURCES.metrikaCounter,
    date1: range.from,
    date2: range.to,
    accuracy: "full",
    lang: "ru",
    ...params,
  });
  const response = await fetch(`https://api-metrika.yandex.net/stat/v1/data?${query}`, {
    headers: { authorization: `OAuth ${token}` },
    signal: AbortSignal.timeout(30000),
  });
  const body = (await response.json().catch(() => ({}))) as MetrikaBody;
  if (!response.ok) {
    throw new Error(body.errors?.[0]?.message ?? body.message ?? `Метрика ответила ${response.status}`);
  }
  return body;
}

function toTotals(values: number[] | undefined): TrafficTotals {
  return { visits: values?.[0] ?? 0, users: values?.[1] ?? 0, pageviews: values?.[2] ?? 0 };
}

const SESSION_METRICS = "ym:s:visits,ym:s:users,ym:s:pageviews";

async function buildReport(range: TrafficRange): Promise<TrafficReport> {
  let token: string;
  try {
    token = fs.readFileSync(YANDEX_TOKEN_FILE, "utf8").trim();
  } catch {
    throw new Error("нет токена Яндекса (var/yandex-token.txt), тот же, что для раздела SEO");
  }
  const previous = previousRange(range);
  const [daily, previousTotals, pages] = await Promise.all([
    stat(token, range, { metrics: SESSION_METRICS, dimensions: "ym:s:date", sort: "ym:s:date", limit: "1000" }),
    stat(token, previous, { metrics: SESSION_METRICS }),
    stat(token, range, {
      metrics: "ym:pv:pageviews,ym:pv:users",
      dimensions: "ym:pv:URLPath",
      sort: "-ym:pv:pageviews",
      limit: String(TOP_PAGES),
    }),
  ]);
  return {
    range,
    previous,
    totals: toTotals(daily.totals),
    previousTotals: toTotals(previousTotals.totals),
    days: (daily.data ?? []).map((row) => ({ date: row.dimensions[0]?.name ?? "", ...toTotals(row.metrics) })),
    pages: (pages.data ?? []).map((row) => ({
      path: row.dimensions[0]?.name ?? "",
      pageviews: row.metrics[0] ?? 0,
      users: row.metrics[1] ?? 0,
    })),
    fetchedAt: Date.now(),
  };
}

const cache = new Map<string, { at: number; report: Promise<TrafficReport> }>();

export async function trafficReport(range: TrafficRange): Promise<TrafficResult> {
  const key = `${range.from}:${range.to}`;
  const now = Date.now();
  for (const [entryKey, entry] of cache) if (now - entry.at > CACHE_MS) cache.delete(entryKey);
  let entry = cache.get(key);
  if (!entry) {
    entry = { at: now, report: buildReport(range) };
    cache.set(key, entry);
  }
  try {
    return { ok: true, report: await entry.report };
  } catch (error) {
    cache.delete(key);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
