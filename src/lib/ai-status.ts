import { aiConfig, aiFetch } from "./ai";
import { getDb } from "./db";
import { env } from "./env.mjs";

const TYPICAL_REWRITE_COST = 0.0004;
const MODELS_CACHE_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface OpenRouterKey {
  label: string;
  limit: number | null;
  limitRemaining: number | null;
  usage: number;
  usageDaily: number | null;
  usageWeekly: number | null;
  usageMonthly: number | null;
  isFreeTier: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  promptPerMillion: number;
  completionPerMillion: number;
  contextLength: number | null;
  found: boolean;
}

export interface OpenRouterAccount {
  credits: { total: number; used: number } | null;
  key: OpenRouterKey | null;
  models: ModelInfo[];
  latencyMs: number | null;
  errors: string[];
}

interface RawModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

let modelsCache: { at: number; list: RawModel[] } | null = null;

async function openRouterGet<T>(path: string, auth: boolean): Promise<T> {
  const { baseUrl } = aiConfig();
  const response = await aiFetch(`${baseUrl}${path}`, {
    headers: auth ? { Authorization: `Bearer ${env("AI_API_KEY", "")}` } : {},
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function modelCatalog(): Promise<RawModel[]> {
  if (modelsCache && Date.now() - modelsCache.at < MODELS_CACHE_MS) return modelsCache.list;
  const { data } = await openRouterGet<{ data: RawModel[] }>("/models", false);
  modelsCache = { at: Date.now(), list: data };
  return data;
}

const perMillion = (price: string | undefined) => Math.round(Number(price ?? 0) * 1e6 * 1000) / 1000;

function describeError(error: unknown): string {
  const cause = (error as { cause?: Error }).cause?.message;
  return cause ?? (error as Error).message;
}

export async function fetchOpenRouterAccount(): Promise<OpenRouterAccount> {
  const config = aiConfig();
  const account: OpenRouterAccount = {
    credits: null,
    key: null,
    models: config.models.map((id) => ({
      id,
      name: id,
      promptPerMillion: 0,
      completionPerMillion: 0,
      contextLength: null,
      found: false,
    })),
    latencyMs: null,
    errors: [],
  };
  if (!config.keyConfigured || !config.isOpenRouter) return account;

  const startedAt = Date.now();
  const [credits, key, catalog] = await Promise.allSettled([
    openRouterGet<{ data: { total_credits: number; total_usage: number } }>("/credits", true),
    openRouterGet<{
      data: {
        label?: string;
        limit?: number | null;
        limit_remaining?: number | null;
        usage?: number;
        usage_daily?: number;
        usage_weekly?: number;
        usage_monthly?: number;
        is_free_tier?: boolean;
      };
    }>("/key", true),
    modelCatalog(),
  ]);

  if (key.status === "fulfilled") {
    account.latencyMs = Date.now() - startedAt;
    const data = key.value.data;
    account.key = {
      label: data.label ?? "",
      limit: data.limit ?? null,
      limitRemaining: data.limit_remaining ?? null,
      usage: data.usage ?? 0,
      usageDaily: data.usage_daily ?? null,
      usageWeekly: data.usage_weekly ?? null,
      usageMonthly: data.usage_monthly ?? null,
      isFreeTier: Boolean(data.is_free_tier),
    };
  } else {
    account.errors.push(`Данные ключа: ${describeError(key.reason)}`);
  }

  if (credits.status === "fulfilled") {
    account.credits = {
      total: credits.value.data.total_credits,
      used: credits.value.data.total_usage,
    };
  } else {
    account.errors.push(`Баланс: ${describeError(credits.reason)}`);
  }

  if (catalog.status === "fulfilled") {
    account.models = config.models.map((id) => {
      const model = catalog.value.find((entry) => entry.id === id);
      return {
        id,
        name: model?.name ?? id,
        promptPerMillion: perMillion(model?.pricing?.prompt),
        completionPerMillion: perMillion(model?.pricing?.completion),
        contextLength: model?.context_length ?? null,
        found: Boolean(model),
      };
    });
  } else {
    account.errors.push(`Список моделей: ${describeError(catalog.reason)}`);
  }

  return account;
}

export interface UsagePeriod {
  label: string;
  total: number;
  failed: number;
  cost: number;
  avgDurationMs: number | null;
  avgFirstTokenMs: number | null;
}

export interface ModelUsage {
  model: string;
  provider: string;
  total: number;
  failed: number;
  cost: number;
  avgDurationMs: number | null;
}

export interface AiLogRow {
  id: number;
  createdAt: number;
  task: string;
  model: string;
  provider: string;
  durationMs: number;
  firstTokenMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  cost: number | null;
  ok: boolean;
  error: string;
}

export interface AiUsage {
  periods: UsagePeriod[];
  byModel: ModelUsage[];
  recent: AiLogRow[];
  averageRewriteCost: number;
}

export function aiUsage(): AiUsage {
  const db = getDb();
  const now = Date.now();

  const period = (label: string, since: number): UsagePeriod => {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed,
                COALESCE(SUM(cost), 0) AS cost,
                AVG(CASE WHEN ok = 1 AND task <> 'check' THEN duration_ms END) AS avgDuration,
                AVG(CASE WHEN ok = 1 AND task <> 'check' THEN first_token_ms END) AS avgFirst
           FROM ai_requests
          WHERE created_at >= ?`,
      )
      .get(since) as {
      total: number;
      failed: number | null;
      cost: number;
      avgDuration: number | null;
      avgFirst: number | null;
    };
    return {
      label,
      total: row.total,
      failed: row.failed ?? 0,
      cost: row.cost,
      avgDurationMs: row.avgDuration === null ? null : Math.round(row.avgDuration),
      avgFirstTokenMs: row.avgFirst === null ? null : Math.round(row.avgFirst),
    };
  };

  const byModel = (
    db
      .prepare(
        `SELECT model, provider,
                COUNT(*) AS total,
                SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed,
                COALESCE(SUM(cost), 0) AS cost,
                AVG(CASE WHEN ok = 1 THEN duration_ms END) AS avgDuration
           FROM ai_requests
          WHERE created_at >= ?
          GROUP BY model, provider
          ORDER BY total DESC
          LIMIT 12`,
      )
      .all(now - 30 * DAY_MS) as Array<{
      model: string;
      provider: string;
      total: number;
      failed: number | null;
      cost: number;
      avgDuration: number | null;
    }>
  ).map((row) => ({
    model: row.model,
    provider: row.provider,
    total: row.total,
    failed: row.failed ?? 0,
    cost: row.cost,
    avgDurationMs: row.avgDuration === null ? null : Math.round(row.avgDuration),
  }));

  const recent = (
    db
      .prepare(
        `SELECT id, created_at AS createdAt, task, model, provider,
                duration_ms AS durationMs, first_token_ms AS firstTokenMs,
                tokens_in AS tokensIn, tokens_out AS tokensOut, cost, ok, error
           FROM ai_requests
          ORDER BY id DESC
          LIMIT 30`,
      )
      .all() as Array<Omit<AiLogRow, "ok"> & { ok: number }>
  ).map((row) => ({ ...row, ok: row.ok === 1 }));

  const rewriteCost = db
    .prepare(
      `SELECT AVG(cost) AS cost FROM ai_requests
        WHERE task = 'rewrite' AND ok = 1 AND cost > 0 AND created_at >= ?`,
    )
    .get(now - 30 * DAY_MS) as { cost: number | null };

  return {
    periods: [
      period("За сутки", now - DAY_MS),
      period("За 7 дней", now - 7 * DAY_MS),
      period("За 30 дней", now - 30 * DAY_MS),
    ],
    byModel,
    recent,
    averageRewriteCost: rewriteCost.cost ?? TYPICAL_REWRITE_COST,
  };
}
