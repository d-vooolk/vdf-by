import path from "node:path";

import { getDb } from "./db";
import { env } from "./env.mjs";
import { collectCompetitors, collectSearch, normalizeDomain } from "./seo-collect.mjs";

export type SeoKind = "search" | "competitors";

export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

export interface DateRange {
  from: string;
  to: string;
}

export interface Periods {
  current: DateRange;
  previous: DateRange;
}

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GoogleData {
  dates: Periods;
  weekDates: Periods;
  totals: GscRow | null;
  previousTotals: GscRow | null;
  weekTotals: GscRow | null;
  previousWeekTotals: GscRow | null;
  queries: GscRow[];
  previousQueries: GscRow[];
  pages: GscRow[];
  previousPages: GscRow[];
  devices: GscRow[];
  daily: GscRow[];
  sitemaps: Array<{
    path: string;
    lastDownloaded?: string;
    errors?: string | number;
    warnings?: string | number;
    contents?: Array<{ type: string; submitted: string; indexed?: string }>;
  }>;
}

export interface WebmasterQuery {
  query_id: string;
  query_text: string;
  indicators: Record<string, number | null>;
}

export interface WebmasterData {
  dates: Periods;
  summary: {
    sqi?: number;
    searchable_pages_count?: number;
    excluded_pages_count?: number;
    site_problems?: Record<string, number>;
  };
  diagnostics: Record<string, { severity: string; state: string; last_state_update: string | null }>;
  sitemaps: Array<{ sitemap_url: string; last_access_date?: string; urls_count?: number; errors_count?: number }>;
  userSitemaps: Array<{ sitemap_url: string; added_date?: string }>;
  queries: WebmasterQuery[];
  previousQueries: WebmasterQuery[];
  events: Array<{
    url: string;
    title?: string;
    event_date?: string;
    event: string;
    excluded_url_status?: string;
    target_url?: string;
  }>;
  inSearch: Array<{ date: string; value: number }>;
  queryHistory: Record<string, Array<{ date: string; value: number }>>;
}

export interface MetrikaReport {
  totals: number[];
  rows: Array<{ dimensions: Array<{ name: string | null; id?: string | null }>; metrics: number[] }>;
}

export interface MetrikaData {
  dates: Periods;
  goals: Array<{ id: number; name: string; type: string }>;
  sources: MetrikaReport;
  previousSources: MetrikaReport;
  engines: MetrikaReport;
  previousEngines: MetrikaReport;
  landings: MetrikaReport;
  devices: MetrikaReport;
  goalsBySource: MetrikaReport | null;
  daily: MetrikaReport;
}

export interface SearchSnapshot {
  collectedAt: number;
  sources: { gscSite: string; yandexHost: string; metrikaCounter: string };
  google: Section<GoogleData>;
  webmaster: Section<WebmasterData>;
  metrika: Section<MetrikaData>;
}

export interface CompetitorSite {
  domain: string;
  checkedAt: number;
  error?: string;
  home?: {
    status: number;
    finalUrl: string;
    https: boolean;
    firstByteMs: number;
    totalMs: number;
    bytes: number;
    server: string;
    title: string;
    description: string;
    h1: string;
    h1Count: number;
    canonical: string;
    robots: string;
    generator: string;
    lang: string;
    openGraph: boolean;
    schema: string[];
    internalLinks: number;
    words: number;
    analytics: { metrika: boolean; google: boolean };
  };
  robots?: {
    status: number;
    sitemaps?: number;
    cleanParam?: boolean;
    host?: string;
    blocksAll?: boolean;
    error?: string;
  };
  sitemap?: {
    files: number;
    urls: number;
    kinds: { products: number; articles: number; categories: number; other: number };
    truncated: boolean;
    newestLastmod: string | null;
    updatedLastMonth: number;
    errors: string[];
  };
  pagespeed?: {
    score?: number;
    lcpMs?: number | null;
    cls?: number | null;
    tbtMs?: number | null;
    fieldLcpMs?: number | null;
    fieldCategory?: string | null;
    error?: string;
  };
}

export interface CompetitorsSnapshot {
  collectedAt: number;
  ownDomain: string;
  sites: CompetitorSite[];
}

interface SnapshotMap {
  search: SearchSnapshot;
  competitors: CompetitorsSnapshot;
}

export interface SeoStatus {
  startedAt: number | null;
  finishedAt: number | null;
  errors: string[];
}

const KEEP: Record<SeoKind, number> = { search: 120, competitors: 60 };
const COMPETITORS_KEY = "seo:competitors";
const STATUS_KEY = (kind: SeoKind) => `seo:status:${kind}`;
const STALE_RUN_MS = 30 * 60 * 1000;

export const OWN_DOMAIN = "vdf.by";

export const DEFAULT_COMPETITORS = [
  "mir-far.by",
  "armtek.by",
  "avtosvet.by",
  "carlight.by",
  "diod.by",
  "runoavto.by",
  "retrofitminsk.by",
  "autosky.by",
  "aozoom.by",
  "bi-led.by",
  "bixenon.by",
  "atom-tuning.by",
  "exclusiv-fara.by",
  "s-turbo.by",
  "ledpremium.by",
  "stekla-far.by",
  "dbs.by",
  "redled.by",
];

function readSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function writeSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

export function getCompetitors(): string[] {
  const stored = readSetting(COMPETITORS_KEY);
  if (stored === null) return DEFAULT_COMPETITORS;
  return JSON.parse(stored) as string[];
}

export function parseCompetitors(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((entry) => normalizeDomain(entry))
        .filter((domain) => domain && domain !== OWN_DOMAIN),
    ),
  ].slice(0, 40);
}

export function saveCompetitors(domains: string[]): void {
  writeSetting(COMPETITORS_KEY, JSON.stringify(domains));
}

export function seoStatus(kind: SeoKind): SeoStatus {
  const stored = readSetting(STATUS_KEY(kind));
  return stored ? (JSON.parse(stored) as SeoStatus) : { startedAt: null, finishedAt: null, errors: [] };
}

function setStatus(kind: SeoKind, status: SeoStatus): void {
  writeSetting(STATUS_KEY(kind), JSON.stringify(status));
}

export function isSeoRunning(kind: SeoKind): boolean {
  const status = seoStatus(kind);
  return (
    status.startedAt !== null &&
    (status.finishedAt === null || status.finishedAt < status.startedAt) &&
    Date.now() - status.startedAt < STALE_RUN_MS
  );
}

export function latestSnapshots<K extends SeoKind>(kind: K, limit = 2): Array<SnapshotMap[K]> {
  const rows = getDb()
    .prepare("SELECT data FROM seo_snapshots WHERE kind = ? ORDER BY created_at DESC LIMIT ?")
    .all(kind, limit) as Array<{ data: string }>;
  return rows.map((row) => JSON.parse(row.data) as SnapshotMap[K]);
}

function saveSnapshot(kind: SeoKind, data: unknown): void {
  const db = getDb();
  db.prepare("INSERT INTO seo_snapshots (kind, created_at, data) VALUES (?, ?, ?)").run(
    kind,
    Date.now(),
    JSON.stringify(data),
  );
  db.prepare(
    `DELETE FROM seo_snapshots
      WHERE kind = ? AND id NOT IN (
        SELECT id FROM seo_snapshots WHERE kind = ? ORDER BY created_at DESC LIMIT ?
      )`,
  ).run(kind, kind, KEEP[kind]);
}

function searchErrors(snapshot: SearchSnapshot): string[] {
  return [
    snapshot.google.ok ? "" : `Search Console: ${snapshot.google.error}`,
    snapshot.webmaster.ok ? "" : `Вебмастер: ${snapshot.webmaster.error}`,
    snapshot.metrika.ok ? "" : `Метрика: ${snapshot.metrika.error}`,
  ].filter(Boolean);
}

export async function runSeoCollection(kind: SeoKind): Promise<SeoStatus> {
  if (isSeoRunning(kind)) return seoStatus(kind);
  const startedAt = Date.now();
  setStatus(kind, { startedAt, finishedAt: null, errors: [] });
  let errors: string[] = [];
  try {
    if (kind === "search") {
      const snapshot = (await collectSearch({
        secretsDir: env("SEO_SECRETS_DIR", path.join(process.cwd(), "var")),
      })) as SearchSnapshot;
      errors = searchErrors(snapshot);
      if (snapshot.google.ok || snapshot.webmaster.ok || snapshot.metrika.ok) saveSnapshot(kind, snapshot);
    } else {
      const snapshot = (await collectCompetitors(getCompetitors(), {
        ownDomain: OWN_DOMAIN,
        pagespeedKey: env("PAGESPEED_API_KEY", ""),
      })) as CompetitorsSnapshot;
      errors = snapshot.sites.filter((site) => site.error).map((site) => `${site.domain}: ${site.error}`);
      saveSnapshot(kind, snapshot);
    }
  } catch (error) {
    errors = [error instanceof Error ? error.message : String(error)];
  }
  const status = { startedAt, finishedAt: Date.now(), errors };
  setStatus(kind, status);
  return status;
}

export interface RankedRow {
  key: string;
  position: number;
  impressions: number;
  clicks: number;
}

export interface Mover extends RankedRow {
  previousPosition: number;
  delta: number;
}

export const POSITION_BUCKETS = [
  { label: "1–3", min: 0, max: 3.5 },
  { label: "4–10", min: 3.5, max: 10.5 },
  { label: "11–20", min: 10.5, max: 20.5 },
  { label: "21–50", min: 20.5, max: 50.5 },
  { label: "51+", min: 50.5, max: Infinity },
] as const;

export function positionBuckets(rows: RankedRow[]): number[] {
  return POSITION_BUCKETS.map(
    (bucket) => rows.filter((row) => row.position > bucket.min && row.position <= bucket.max).length,
  );
}

export function gscRows(rows: GscRow[], toKey: (key: string) => string = (key) => key): RankedRow[] {
  return rows.map((row) => ({
    key: toKey(row.keys[0] ?? ""),
    position: row.position,
    impressions: row.impressions,
    clicks: row.clicks,
  }));
}

export function webmasterRows(rows: WebmasterQuery[]): RankedRow[] {
  return rows
    .map((row) => ({
      key: row.query_text,
      position: row.indicators.AVG_SHOW_POSITION ?? 0,
      impressions: row.indicators.TOTAL_SHOWS ?? 0,
      clicks: row.indicators.TOTAL_CLICKS ?? 0,
    }))
    .filter((row) => row.position > 0);
}

export function movers(
  current: RankedRow[],
  previous: RankedRow[],
  minImpressions = 3,
): { up: Mover[]; down: Mover[]; added: RankedRow[]; lost: RankedRow[] } {
  const before = new Map(previous.map((row) => [row.key, row]));
  const now = new Map(current.map((row) => [row.key, row]));
  const compared: Mover[] = current
    .filter((row) => before.has(row.key) && row.impressions + before.get(row.key)!.impressions >= minImpressions)
    .map((row) => {
      const previousPosition = before.get(row.key)!.position;
      return { ...row, previousPosition, delta: previousPosition - row.position };
    });
  return {
    up: compared.filter((row) => row.delta >= 0.5).sort((a, b) => b.delta - a.delta),
    down: compared.filter((row) => row.delta <= -0.5).sort((a, b) => a.delta - b.delta),
    added: current
      .filter((row) => !before.has(row.key) && row.impressions >= minImpressions)
      .sort((a, b) => b.impressions - a.impressions),
    lost: previous
      .filter((row) => !now.has(row.key) && row.impressions >= minImpressions)
      .sort((a, b) => b.impressions - a.impressions),
  };
}

export function opportunities(rows: RankedRow[], minImpressions = 10): RankedRow[] {
  return rows
    .filter((row) => row.position >= 4 && row.position <= 20 && row.impressions >= minImpressions)
    .sort((a, b) => b.impressions - a.impressions);
}

export function sitePath(url: string): string {
  return url.replace(/^https:\/\/(www\.)?vdf\.by/i, "") || "/";
}
