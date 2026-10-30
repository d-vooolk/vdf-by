import fs from "node:fs";

import { AI_BOTS, AI_REFERRER, AI_SOURCE_NAME, BRAND_QUERY, isQuestion } from "./ai-seo-shared.mjs";
import { AiError, aiConfigured, completeWithSources } from "./ai";
import { getDb } from "./db";
import { DEFAULT_SEO_SOURCES } from "./seo-collect.mjs";
import { sitePath, YANDEX_TOKEN_FILE, type SearchSnapshot } from "./seo-data";
import { minskDay } from "./traffic";

export type QueryGroup = "glass" | "lightguide" | "frames" | "biled" | "brand";

export const AI_QUERIES: Array<{ query: string; group: QueryGroup }> = [
  { query: "стекло фары купить минск", group: "glass" },
  { query: "где купить стекло фары в беларуси", group: "glass" },
  { query: "стекло фары bmw x5 e70 купить", group: "glass" },
  { query: "стекло фары audi a6 c7 купить", group: "glass" },
  { query: "стекло фары bmw f10 цена", group: "glass" },
  { query: "замена стекла фары своими руками", group: "glass" },
  { query: "какой герметик нужен для стекла фары", group: "glass" },
  { query: "что лучше: полировка фары или замена стекла", group: "glass" },
  { query: "световод фары купить минск", group: "lightguide" },
  { query: "световод дхо audi купить", group: "lightguide" },
  { query: "почему желтеет световод в фаре и можно ли его заменить", group: "lightguide" },
  { query: "переходные рамки для линз купить", group: "frames" },
  { query: "рамки hella 3r купить", group: "frames" },
  { query: "какая переходная рамка нужна для bi-led линз", group: "frames" },
  { query: "переходные рамки для линз bmw купить минск", group: "frames" },
  { query: "bi-led линзы купить минск", group: "biled" },
  { query: "какие bi-led линзы лучше", group: "biled" },
  { query: "aozoom отзывы", group: "biled" },
  { query: "bi-led линзы 3 дюйма купить в беларуси", group: "biled" },
  { query: "можно ли пройти техосмотр с bi-led линзами в беларуси", group: "biled" },
  { query: "магазин автосвета минск", group: "brand" },
  { query: "интернет-магазин запчастей для фар беларусь", group: "brand" },
  { query: "vdf.by отзывы", group: "brand" },
  { query: "vdf магазин автосвета минск", group: "brand" },
  { query: "vdf.by", group: "brand" },
];

export const GROUP_LABELS: Record<QueryGroup, string> = {
  glass: "Стёкла фар",
  lightguide: "Световоды",
  frames: "Переходные рамки",
  biled: "Би-LED",
  brand: "Магазин и бренд",
};

export interface AiEngine {
  id: string;
  label: string;
  model?: string;
  extra?: Record<string, unknown>;
}

export const AI_ENGINES: AiEngine[] = [
  { id: "perplexity", label: "Perplexity", model: "perplexity/sonar" },
  {
    id: "chatgpt",
    label: "ChatGPT + поиск",
    model: "openai/gpt-5.4-mini",
    extra: { plugins: [{ id: "web", max_results: 8 }] },
  },
  {
    id: "gemini",
    label: "Gemini + поиск",
    model: "google/gemini-3.5-flash",
    extra: { plugins: [{ id: "web", max_results: 8 }], reasoning: { effort: "low" } },
  },
  { id: "yandex", label: "Яндекс Нейро / Алиса" },
  { id: "google_aio", label: "Google AI Overviews / AI Mode" },
];

export const AUTO_ENGINES = AI_ENGINES.filter((engine) => engine.model);
export const MANUAL_ENGINES = AI_ENGINES.filter((engine) => !engine.model);

const OUR_NAME = /vdf\.by|\bvdf\b|вдф/i;
const NOT_OURS = /vdf[\s-]?light(\.ru)?/gi;
const OUR_HOST = /(^|\.)vdf\.by$/i;
const REDIRECT_HOST = /(^|\.)vertexaisearch\.cloud\.google\.com$/i;
const RUN_KEY = "aiseo:run";
const STALE_RUN_MS = 15 * 60 * 1000;
const WORKERS = 4;
const SYSTEM = "Отвечай на русском, коротко и по делу. Пользователь находится в Минске, Беларусь.";
const DAY_MS = 24 * 60 * 60 * 1000;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function readSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function writeSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

export interface RunState {
  run: string;
  startedAt: number;
  finishedAt: number | null;
  done: number;
  total: number;
  errors: number;
}

export function runState(): RunState | null {
  const raw = readSetting(RUN_KEY);
  return raw ? (JSON.parse(raw) as RunState) : null;
}

export function isCheckRunning(state: RunState | null = runState()): boolean {
  return Boolean(state && !state.finishedAt && Date.now() - state.startedAt < STALE_RUN_MS);
}

interface CheckResult {
  mentioned: boolean;
  linked: boolean;
  citedUrl: string;
  rank: number | null;
  sources: string[];
  answer: string;
  error: string;
}

async function resolveSource(url: string): Promise<string> {
  if (!REDIRECT_HOST.test(hostOf(url))) return url;
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10000) });
    return response.headers.get("location") || url;
  } catch {
    return url;
  }
}

async function checkOne(engine: AiEngine, query: string): Promise<CheckResult> {
  try {
    const answer = await completeWithSources(SYSTEM, query, "aiseo", {
      models: [engine.model!],
      temperature: 0.2,
      maxTokens: 1500,
      timeout: 120000,
      extra: engine.extra,
    });
    const sources = [...new Set(await Promise.all(answer.sources.map(resolveSource)))];
    const ourIndex = sources.findIndex((url) => OUR_HOST.test(hostOf(url)));
    const linked = ourIndex >= 0 || /vdf\.by/i.test(answer.text);
    return {
      mentioned: linked || OUR_NAME.test(answer.text.replace(NOT_OURS, "")),
      linked,
      citedUrl: ourIndex >= 0 ? sources[ourIndex] : "",
      rank: ourIndex >= 0 ? ourIndex + 1 : null,
      sources,
      answer: answer.text.slice(0, 6000),
      error: "",
    };
  } catch (error) {
    return {
      mentioned: false,
      linked: false,
      citedUrl: "",
      rank: null,
      sources: [],
      answer: "",
      error: error instanceof AiError ? error.message : (error as Error).message,
    };
  }
}

function saveCheck(run: string, engine: string, query: string, result: CheckResult, manual = false): void {
  getDb()
    .prepare(
      `INSERT INTO ai_checks (run, ts, engine, query, mentioned, linked, cited_url, rank, sources, answer, error, manual)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(run, engine, query) DO UPDATE SET
         ts = excluded.ts, mentioned = excluded.mentioned, linked = excluded.linked,
         cited_url = excluded.cited_url, rank = excluded.rank, sources = excluded.sources,
         answer = excluded.answer, error = excluded.error, manual = excluded.manual`,
    )
    .run(
      run,
      Date.now(),
      engine,
      query,
      result.mentioned ? 1 : 0,
      result.linked ? 1 : 0,
      result.citedUrl,
      result.rank,
      JSON.stringify(result.sources),
      result.answer,
      result.error,
      manual ? 1 : 0,
    );
}

export function startAnswerCheck(): { ok: true; done: Promise<void> } | { ok: false; error: string } {
  if (!aiConfigured()) return { ok: false, error: "Нейросеть не подключена: в .env на сервере не задан AI_API_KEY" };
  if (isCheckRunning()) return { ok: false, error: "Проверка уже идёт" };

  const tasks = AUTO_ENGINES.flatMap((engine) => AI_QUERIES.map(({ query }) => ({ engine, query })));
  const run = minskDay();
  const progress: RunState = { run, startedAt: Date.now(), finishedAt: null, done: 0, total: tasks.length, errors: 0 };
  writeSetting(RUN_KEY, JSON.stringify(progress));

  const worker = async () => {
    for (let task = tasks.shift(); task; task = tasks.shift()) {
      const result = await checkOne(task.engine, task.query);
      saveCheck(run, task.engine.id, task.query, result);
      progress.done += 1;
      if (result.error) progress.errors += 1;
      writeSetting(RUN_KEY, JSON.stringify(progress));
    }
  };
  const done = Promise.all(Array.from({ length: WORKERS }, worker))
    .then(() => undefined)
    .catch((error) => console.error("[ai-seo]", error))
    .finally(() => {
      progress.finishedAt = Date.now();
      writeSetting(RUN_KEY, JSON.stringify(progress));
    });
  return { ok: true, done };
}

export function saveManualChecks(run: string, engine: string, marks: Record<string, number>, competitors: string): void {
  const sources = competitors
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry.includes("://") ? entry : `https://${entry}`));
  getDb().transaction(() => {
    for (const { query } of AI_QUERIES) {
      const mark = marks[query];
      if (mark === undefined || mark < 0 || mark > 2) continue;
      saveCheck(
        run,
        engine,
        query,
        { mentioned: mark >= 1, linked: mark === 2, citedUrl: "", rank: null, sources, answer: "", error: "" },
        true,
      );
    }
  })();
}

interface QuestionTotals {
  queries: number;
  impressions: number;
  clicks: number;
  top5: number;
  top5Clicks: number;
}

export interface EngineQuestions {
  total: { queries: number; impressions: number; clicks: number };
  questions: QuestionTotals;
}

export interface QuestionDay {
  day: string;
  google: EngineQuestions | null;
  yandex: EngineQuestions | null;
}

function questionStats(rows: Array<{ query: string; impressions: number; clicks: number; position: number }>): EngineQuestions {
  const total = { queries: 0, impressions: 0, clicks: 0 };
  const questions: QuestionTotals = { queries: 0, impressions: 0, clicks: 0, top5: 0, top5Clicks: 0 };
  for (const row of rows) {
    total.queries += 1;
    total.impressions += row.impressions;
    total.clicks += row.clicks;
    if (BRAND_QUERY.test(row.query) || !isQuestion(row.query)) continue;
    questions.queries += 1;
    questions.impressions += row.impressions;
    questions.clicks += row.clicks;
    if (row.position <= 5) {
      questions.top5 += row.impressions;
      questions.top5Clicks += row.clicks;
    }
  }
  return { total, questions };
}

function syncQuestionStats(): void {
  const db = getDb();
  const last = (db.prepare("SELECT MAX(snapshot_id) AS id FROM ai_questions").get() as { id: number | null }).id ?? 0;
  const fresh = db
    .prepare("SELECT id, created_at, data FROM seo_snapshots WHERE kind = 'search' AND id > ? ORDER BY id")
    .all(last) as Array<{ id: number; created_at: number; data: string }>;
  if (!fresh.length) return;
  const upsert = db.prepare(
    `INSERT INTO ai_questions (day, snapshot_id, data) VALUES (?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET snapshot_id = excluded.snapshot_id, data = excluded.data`,
  );
  db.transaction(() => {
    for (const row of fresh) {
      const snapshot = JSON.parse(row.data) as SearchSnapshot;
      const google = snapshot.google.ok
        ? questionStats(
            snapshot.google.data.queries.map((entry) => ({
              query: entry.keys[0] ?? "",
              impressions: entry.impressions,
              clicks: entry.clicks,
              position: entry.position,
            })),
          )
        : null;
      const yandex = snapshot.webmaster.ok
        ? questionStats(
            snapshot.webmaster.data.queries
              .filter((entry) => entry.indicators.TOTAL_SHOWS)
              .map((entry) => ({
                query: entry.query_text,
                impressions: entry.indicators.TOTAL_SHOWS ?? 0,
                clicks: entry.indicators.TOTAL_CLICKS ?? 0,
                position: entry.indicators.AVG_SHOW_POSITION ?? 99,
              })),
          )
        : null;
      upsert.run(minskDay(row.created_at), row.id, JSON.stringify({ google, yandex }));
    }
  })();
}

export interface AiReferrals {
  from: string;
  to: string;
  total: number;
  organic: number;
  byMonth: Array<{ month: string; ai: number; organic: number }>;
  byHost: Array<{ host: string; visits: number }>;
  byPage: Array<{ path: string; visits: number }>;
  goals: Array<{ name: string; reaches: number }>;
}

export type AiReferralsResult = { ok: true; data: AiReferrals } | { ok: false; error: string };

const REFERRAL_MONTHS = 12;
const REFERRAL_CACHE_MS = 10 * 60 * 1000;
const TRACKED_GOALS = ["order", "fit_check", "product_messenger"];
const NOT_SEARCH = "ym:s:lastTrafficSource!='organic' AND ym:s:lastTrafficSource!='internal'";

interface MetrikaRows {
  data?: Array<{ dimensions: Array<{ name?: string | null; id?: string | null }>; metrics: number[] }>;
  message?: string;
  errors?: Array<{ message?: string }>;
}

interface MetrikaGoal {
  id: number;
  name: string;
  conditions?: Array<{ url?: string }>;
}

async function metrika(token: string, path: string, params: Record<string, string> = {}): Promise<MetrikaRows & { goals?: MetrikaGoal[] }> {
  const query = Object.keys(params).length ? `?${new URLSearchParams(params)}` : "";
  const response = await fetch(`https://api-metrika.yandex.net${path}${query}`, {
    headers: { authorization: `OAuth ${token}` },
    signal: AbortSignal.timeout(30000),
  });
  const body = (await response.json().catch(() => ({}))) as MetrikaRows & { goals?: MetrikaGoal[] };
  if (!response.ok) throw new Error(body.errors?.[0]?.message ?? body.message ?? `Метрика ответила ${response.status}`);
  return body;
}

function aiHost(dimensions: Array<{ name?: string | null; id?: string | null }>): string | null {
  for (const dimension of dimensions) {
    const values = [dimension.name ?? "", dimension.id ?? ""].map((value) => value.trim().toLowerCase());
    for (const value of values) {
      if (!value) continue;
      const host = value.includes("://") ? hostOf(value) : value.replace(/^www\./, "");
      if (AI_REFERRER.test(host)) return host;
      if (AI_SOURCE_NAME.test(value)) return dimension.name ?? value;
    }
  }
  return null;
}

async function buildReferrals(): Promise<AiReferrals> {
  let token: string;
  try {
    token = fs.readFileSync(YANDEX_TOKEN_FILE, "utf8").trim();
  } catch {
    throw new Error("нет токена Яндекса (var/yandex-token.txt), тот же, что для сводки SEO");
  }
  const counter = DEFAULT_SEO_SOURCES.metrikaCounter;
  const to = minskDay();
  const start = new Date(Date.parse(`${to.slice(0, 7)}-01T12:00:00Z`));
  start.setUTCMonth(start.getUTCMonth() - (REFERRAL_MONTHS - 1));
  const from = start.toISOString().slice(0, 10);
  const base = { ids: counter, date1: from, date2: to, accuracy: "full", lang: "ru" };

  const { goals = [] } = await metrika(token, `/management/v1/counter/${counter}/goals`);
  const tracked = goals
    .filter((goal) => goal.conditions?.some((condition) => TRACKED_GOALS.includes(condition.url ?? "")))
    .slice(0, 5);
  const metrics = ["ym:s:visits", ...tracked.map((goal) => `ym:s:goal${goal.id}reaches`)].join(",");
  const detail = "ym:s:lastSourceEngine,ym:s:lastUTMSource";

  const [sources, monthly, pages] = await Promise.all([
    metrika(token, "/stat/v1/data", { ...base, metrics: "ym:s:visits", dimensions: "ym:s:startOfMonth,ym:s:lastTrafficSource", limit: "1000" }),
    metrika(token, "/stat/v1/data", { ...base, metrics, dimensions: `ym:s:startOfMonth,${detail}`, filters: NOT_SEARCH, limit: "10000" }),
    metrika(token, "/stat/v1/data", { ...base, metrics: "ym:s:visits", dimensions: `ym:s:startURL,${detail}`, filters: NOT_SEARCH, limit: "20000" }),
  ]);

  const months = new Map<string, { ai: number; organic: number }>();
  const monthOf = (value: string | null | undefined) => (value ?? "").slice(0, 7);
  for (const row of sources.data ?? []) {
    const month = monthOf(row.dimensions[0]?.name);
    if (!month || row.dimensions[1]?.id !== "organic") continue;
    const entry = months.get(month) ?? { ai: 0, organic: 0 };
    entry.organic += row.metrics[0] ?? 0;
    months.set(month, entry);
  }

  const hosts = new Map<string, number>();
  const reaches = tracked.map(() => 0);
  let total = 0;
  for (const row of monthly.data ?? []) {
    const host = aiHost(row.dimensions.slice(1));
    if (!host) continue;
    const visits = row.metrics[0] ?? 0;
    total += visits;
    hosts.set(host, (hosts.get(host) ?? 0) + visits);
    tracked.forEach((_, index) => (reaches[index] += row.metrics[index + 1] ?? 0));
    const month = monthOf(row.dimensions[0]?.name);
    const entry = months.get(month) ?? { ai: 0, organic: 0 };
    entry.ai += visits;
    months.set(month, entry);
  }

  const paths = new Map<string, number>();
  for (const row of pages.data ?? []) {
    if (!aiHost(row.dimensions.slice(1))) continue;
    const path = sitePath(row.dimensions[0]?.name ?? "");
    paths.set(path, (paths.get(path) ?? 0) + (row.metrics[0] ?? 0));
  }

  const sorted = <K>(map: Map<K, number>) => [...map.entries()].sort((a, b) => b[1] - a[1]);
  return {
    from,
    to,
    total,
    organic: [...months.values()].reduce((sum, entry) => sum + entry.organic, 0),
    byMonth: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, entry]) => ({ month, ...entry })),
    byHost: sorted(hosts).map(([host, visits]) => ({ host, visits })),
    byPage: sorted(paths).slice(0, 15).map(([path, visits]) => ({ path, visits })),
    goals: tracked.map((goal, index) => ({ name: goal.name, reaches: reaches[index] })),
  };
}

let referralCache: { at: number; result: Promise<AiReferrals> } | null = null;

export async function aiReferrals(): Promise<AiReferralsResult> {
  if (!referralCache || Date.now() - referralCache.at > REFERRAL_CACHE_MS) {
    referralCache = { at: Date.now(), result: buildReferrals() };
  }
  try {
    return { ok: true, data: await referralCache.result };
  } catch (error) {
    referralCache = null;
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface CheckRow {
  run: string;
  engine: string;
  query: string;
  mentioned: boolean;
  linked: boolean;
  citedUrl: string;
  rank: number | null;
  sources: string[];
  answer: string;
  error: string;
  manual: boolean;
}

export interface EngineScore {
  engine: string;
  run: string;
  total: number;
  mentioned: number;
  linked: number;
}

export type BotKind = "answer" | "search" | "train" | "other";

export interface BotStat {
  bot: string;
  owner: string;
  kind: BotKind;
  hits28: number;
  hitsAll: number;
  pages28: number;
}

export interface BotWeek {
  week: string;
  answer: number;
  search: number;
  train: number;
  other: number;
}

export interface AiSeoReport {
  bots: {
    from: string | null;
    to: string | null;
    list: BotStat[];
    weekly: BotWeek[];
    answerPages: Array<{ path: string; hits: number }>;
    searchPages: Array<{ path: string; hits: number }>;
  };
  questions: QuestionDay[];
  scores: EngineScore[];
  latest: Map<string, Map<string, CheckRow>>;
  competitors: Array<{ host: string; answers: number }>;
  run: RunState | null;
}

const SERVICE_PATHS = "('/robots.txt', '/sitemap.xml', '/llms.txt')";

export function aiSeoReport(): AiSeoReport {
  syncQuestionStats();
  const db = getDb();
  const all = <T>(sql: string, ...args: unknown[]) => db.prepare(sql).all(...args) as T[];

  const range = db.prepare("SELECT MIN(day) AS a, MAX(day) AS b FROM ai_bot_hits").get() as {
    a: string | null;
    b: string | null;
  };
  const since28 = range.b ? new Date(Date.parse(`${range.b}T12:00:00Z`) - 27 * DAY_MS).toISOString().slice(0, 10) : "";
  const byBot = new Map(
    all<{ bot: string; total: number; recent: number; pages: number }>(
      `SELECT bot, SUM(hits) AS total, SUM(CASE WHEN day >= ? THEN hits ELSE 0 END) AS recent,
              COUNT(DISTINCT CASE WHEN day >= ? AND path NOT IN ${SERVICE_PATHS} THEN path END) AS pages
         FROM ai_bot_hits WHERE bot != '-' GROUP BY bot`,
      since28,
      since28,
    ).map((row) => [row.bot, row]),
  );
  const kindOf = new Map<string, BotKind>(AI_BOTS.map((bot) => [bot.id, bot.kind as BotKind]));
  const weeks = new Map<string, BotWeek>();
  for (const row of all<{ day: string; bot: string; hits: number }>(
    "SELECT day, bot, SUM(hits) AS hits FROM ai_bot_hits GROUP BY day, bot",
  )) {
    const date = new Date(`${row.day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const week = date.toISOString().slice(0, 10);
    const entry = weeks.get(week) ?? { week, answer: 0, search: 0, train: 0, other: 0 };
    const kind = kindOf.get(row.bot);
    if (kind) entry[kind] += row.hits;
    weeks.set(week, entry);
  }
  const pagesFor = (kind: BotKind) => {
    const bots = AI_BOTS.filter((bot) => bot.kind === kind && bot.id !== "bingbot").map((bot) => bot.id);
    return all<{ path: string; hits: number }>(
      `SELECT path, SUM(hits) AS hits FROM ai_bot_hits
        WHERE bot IN (${bots.map(() => "?").join(",")}) AND path NOT IN ${SERVICE_PATHS}
        GROUP BY path ORDER BY hits DESC LIMIT 15`,
      ...bots,
    );
  };

  const checks = all<{
    run: string;
    engine: string;
    query: string;
    mentioned: number;
    linked: number;
    cited_url: string;
    rank: number | null;
    sources: string;
    answer: string;
    error: string;
    manual: number;
  }>("SELECT run, engine, query, mentioned, linked, cited_url, rank, sources, answer, error, manual FROM ai_checks ORDER BY run, id");
  const queries = new Set(AI_QUERIES.map((entry) => entry.query));
  const scores = new Map<string, EngineScore>();
  const latest = new Map<string, Map<string, CheckRow>>();
  for (const check of checks) {
    if (!queries.has(check.query)) continue;
    const key = `${check.run}|${check.engine}`;
    const score = scores.get(key) ?? { engine: check.engine, run: check.run, total: 0, mentioned: 0, linked: 0 };
    if (!check.error) {
      score.total += 1;
      score.mentioned += check.mentioned;
      score.linked += check.linked;
    }
    scores.set(key, score);
    const byQuery = latest.get(check.engine) ?? new Map<string, CheckRow>();
    byQuery.set(check.query, {
      run: check.run,
      engine: check.engine,
      query: check.query,
      mentioned: check.mentioned === 1,
      linked: check.linked === 1,
      citedUrl: check.cited_url,
      rank: check.rank,
      sources: JSON.parse(check.sources) as string[],
      answer: check.answer,
      error: check.error,
      manual: check.manual === 1,
    });
    latest.set(check.engine, byQuery);
  }

  const competitorCounts = new Map<string, number>();
  for (const byQuery of latest.values()) {
    for (const row of byQuery.values()) {
      for (const host of new Set(row.sources.map(hostOf))) {
        if (host && !OUR_HOST.test(host)) competitorCounts.set(host, (competitorCounts.get(host) ?? 0) + 1);
      }
    }
  }

  return {
    bots: {
      from: range.a,
      to: range.b,
      list: AI_BOTS.map((bot) => ({
        bot: bot.id,
        owner: bot.owner,
        kind: bot.kind as BotKind,
        hits28: byBot.get(bot.id)?.recent ?? 0,
        hitsAll: byBot.get(bot.id)?.total ?? 0,
        pages28: byBot.get(bot.id)?.pages ?? 0,
      })),
      weekly: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
      answerPages: pagesFor("answer"),
      searchPages: pagesFor("search"),
    },
    questions: all<{ day: string; data: string }>("SELECT day, data FROM ai_questions ORDER BY day").map((row) => ({
      day: row.day,
      ...(JSON.parse(row.data) as Omit<QuestionDay, "day">),
    })),
    scores: [...scores.values()],
    latest,
    competitors: [...competitorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([host, answers]) => ({ host, answers })),
    run: runState(),
  };
}

export type ReadyStatus = "done" | "partial" | "todo";

export const READINESS: Array<{ item: string; status: ReadyStatus; who: string; note?: string }> = [
  { item: "robots.txt открыт ИИ-ботам: GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended не закрыты", status: "done", who: "Claude" },
  { item: "Текст карточек и разделов есть в HTML без JavaScript", status: "done", who: "Claude" },
  { item: "Разметка Product / Offer с доставкой и возвратом, Store, FAQPage, BlogPosting, BreadcrumbList", status: "done", who: "Claude" },
  { item: "/llms.txt — карта разделов и статей для нейросетей", status: "done", who: "Claude" },
  { item: "У сайта свой лог nginx (vdf.by.access.log) — заходы ботов считаются без чужих сайтов", status: "done", who: "Claude" },
  {
    item: "ИИ-боты получают 200, без капчи и блокировок лимитами nginx",
    status: "todo",
    who: "Claude",
    note: "проверить запросом с user-agent ChatGPT-User к главной, разделу стёкол и карточке",
  },
  {
    item: "Первый абзац карточек и разделов стёкол, световодов, рамок — прямой ответ: модели и годы, комплект, цена, наличие, срок доставки",
    status: "todo",
    who: "Claude",
  },
  { item: "Bing Webmaster Tools: сайт подтверждён, sitemap отправлен (индекс Bing = ChatGPT и Copilot)", status: "todo", who: "вы" },
  { item: "Одинаковые название, адрес, телефон: Google, Яндекс Бизнес, 2ГИС, каталоги", status: "todo", who: "вы" },
  { item: "Упоминания на сторонних площадках: порталы, форумы, drive2, подборки «где купить стекло фары»", status: "todo", who: "вы" },
  { item: "Отзывы с подробностями (машина, товар, цена) на Яндекс Картах и в Google", status: "todo", who: "вы" },
];
