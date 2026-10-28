#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "../src/lib/env.mjs";
import { DEFAULT_SEO_SOURCES, googleToken, isoDay, requestJson } from "../src/lib/seo-collect.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECRETS_DIR = env("SEO_SECRETS_DIR", path.join(ROOT, "var"));
const OUT_DIR = env("SEO_REPORT_DIR", path.join(ROOT, "var", "seo"));
const DAY_MS = 24 * 60 * 60 * 1000;
const GSC_MAX_DAYS = 16 * 30;

const yandexToken = () => fs.readFileSync(path.join(SECRETS_DIR, "yandex-token.txt"), "utf8").trim();

async function attempt(name, task) {
  try {
    return { ok: true, data: await task() };
  } catch (error) {
    console.error(`[${name}] ${error.message}`);
    return { ok: false, error: error.message };
  }
}

async function collectGoogle() {
  const token = await googleToken(path.join(SECRETS_DIR, "gsc-key.json"));
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const base = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(DEFAULT_SEO_SOURCES.gscSite)}`;
  const range = { from: isoDay(Date.now() - GSC_MAX_DAYS * DAY_MS), to: isoDay(Date.now() - DAY_MS) };
  const query = (dimensions, rowLimit) =>
    requestJson(`${base}/searchAnalytics/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ startDate: range.from, endDate: range.to, dimensions, rowLimit, dataState: "all" }),
    }).then((body) => body.rows ?? []);

  const [totals, daily, queries, pages, devices, countries, queryPages] = await Promise.all([
    query([], 1).then((rows) => rows[0] ?? null),
    query(["date"], 1000),
    query(["query"], 5000),
    query(["page"], 5000),
    query(["device"], 10),
    query(["country"], 20),
    query(["query", "page"], 5000),
  ]);
  return { range, totals, daily, queries, pages, devices, countries, queryPages };
}

async function collectWebmaster() {
  const headers = { authorization: `OAuth ${yandexToken()}` };
  const api = "https://api.webmaster.yandex.net/v4";
  const { user_id: userId } = await requestJson(`${api}/user`, { headers });
  const host = `${api}/user/${userId}/hosts/${encodeURIComponent(DEFAULT_SEO_SOURCES.yandexHost)}`;
  const to = isoDay(Date.now() - DAY_MS);
  const optional = (name, promise, fallback) =>
    promise.catch((error) => {
      console.error(`[Вебмастер: ${name}] ${error.message}`);
      return fallback;
    });

  const popular = async (from) => {
    const queries = [];
    for (let offset = 0; offset < 3000; offset += 500) {
      const params = new URLSearchParams({
        order_by: "TOTAL_SHOWS",
        device_type_indicator: "ALL",
        date_from: from,
        date_to: to,
        limit: "500",
        offset: String(offset),
      });
      for (const indicator of ["TOTAL_SHOWS", "TOTAL_CLICKS", "AVG_SHOW_POSITION", "AVG_CLICK_POSITION"]) {
        params.append("query_indicator", indicator);
      }
      const body = await requestJson(`${host}/search-queries/popular?${params}`, { headers });
      queries.push(...(body.queries ?? []));
      if ((body.queries ?? []).length < 500) break;
    }
    return { from, queries };
  };

  let popularResult = null;
  for (const daysBack of [365, 180, 90]) {
    popularResult = await popular(isoDay(Date.now() - daysBack * DAY_MS)).catch((error) => {
      console.error(`[Вебмастер: запросы за ${daysBack} дней] ${error.message}`);
      return null;
    });
    if (popularResult) break;
  }

  const from = isoDay(Date.now() - 365 * DAY_MS);
  const historyParams = new URLSearchParams({ device_type_indicator: "ALL", date_from: from, date_to: to });
  for (const indicator of ["TOTAL_SHOWS", "TOTAL_CLICKS"]) historyParams.append("query_indicator", indicator);

  const [hostInfo, summary, diagnostics, queryHistory, inSearch, indexing, events] = await Promise.all([
    optional("хост", requestJson(host, { headers }), {}),
    requestJson(`${host}/summary`, { headers }),
    optional("диагностика", requestJson(`${host}/diagnostics`, { headers }).then((body) => body.problems ?? {}), {}),
    optional(
      "история запросов",
      requestJson(`${host}/search-queries/all/history?${historyParams}`, { headers }).then((body) => body.indicators ?? {}),
      {},
    ),
    optional(
      "страницы в поиске",
      requestJson(`${host}/search-urls/in-search/history?${new URLSearchParams({ date_from: from, date_to: to })}`, {
        headers,
      }).then((body) => body.history ?? []),
      [],
    ),
    optional(
      "обход",
      requestJson(`${host}/indexing/history?${new URLSearchParams({ date_from: from, date_to: to })}`, { headers }).then(
        (body) => body.indicators ?? {},
      ),
      {},
    ),
    optional(
      "события",
      requestJson(`${host}/search-urls/events/samples?limit=100`, { headers }).then((body) => body.samples ?? []),
      [],
    ),
  ]);
  return { hostInfo, summary, diagnostics, popular: popularResult, queryHistory, inSearch, indexing, events };
}

async function collectMetrika() {
  const headers = { authorization: `OAuth ${yandexToken()}` };
  const counter = DEFAULT_SEO_SOURCES.metrikaCounter;
  const info = await requestJson(`https://api-metrika.yandex.net/management/v1/counter/${counter}`, { headers });
  const range = { from: info.counter?.create_time?.slice(0, 10) ?? isoDay(Date.now() - 365 * DAY_MS), to: isoDay(Date.now() - DAY_MS) };
  const stat = (params) =>
    requestJson(
      `https://api-metrika.yandex.net/stat/v1/data?${new URLSearchParams({
        ids: counter,
        date1: range.from,
        date2: range.to,
        accuracy: "full",
        limit: "500",
        lang: "ru",
        ...params,
      })}`,
      { headers },
    ).then((body) => ({ totals: body.totals ?? [], rows: body.data ?? [] }));

  const behaviour = "ym:s:visits,ym:s:users,ym:s:bounceRate,ym:s:pageDepth,ym:s:avgVisitDurationSeconds";
  const organic = "ym:s:lastTrafficSource=='organic'";
  const goals = await requestJson(`https://api-metrika.yandex.net/management/v1/counter/${counter}/goals`, { headers }).then(
    (body) => (body.goals ?? []).map((goal) => ({ id: goal.id, name: goal.name, type: goal.type })),
  );
  const goalMetrics = goals.slice(0, 10).map((goal) => `ym:s:goal${goal.id}reaches`).join(",");

  return {
    range,
    goals,
    sources: await stat({ metrics: behaviour, dimensions: "ym:s:lastTrafficSource" }),
    engines: await stat({ metrics: behaviour, dimensions: "ym:s:lastSearchEngineRoot", filters: organic }),
    landings: await stat({ metrics: behaviour, dimensions: "ym:s:startURL", filters: organic, sort: "-ym:s:visits" }),
    phrases: await stat({ metrics: "ym:s:visits", dimensions: "ym:s:lastSearchPhrase", filters: organic, sort: "-ym:s:visits" }),
    devices: await stat({ metrics: behaviour, dimensions: "ym:s:deviceCategory" }),
    cities: await stat({ metrics: "ym:s:visits", dimensions: "ym:s:regionCity", sort: "-ym:s:visits", limit: "30" }),
    weekly: await stat({
      metrics: "ym:s:visits",
      dimensions: "ym:s:startOfWeek,ym:s:lastTrafficSource",
      sort: "ym:s:startOfWeek",
      limit: "2000",
    }),
    weeklyEngines: await stat({
      metrics: "ym:s:visits",
      dimensions: "ym:s:startOfWeek,ym:s:lastSearchEngineRoot",
      filters: organic,
      sort: "ym:s:startOfWeek",
      limit: "2000",
    }),
    goalsBySource: goalMetrics
      ? await stat({ metrics: `ym:s:visits,${goalMetrics}`, dimensions: "ym:s:lastTrafficSource" })
      : null,
  };
}

const [google, webmaster, metrika] = await Promise.all([
  attempt("Search Console", collectGoogle),
  attempt("Вебмастер", collectWebmaster),
  attempt("Метрика", collectMetrika),
]);

fs.mkdirSync(OUT_DIR, { recursive: true });
const file = path.join(OUT_DIR, `alltime-${isoDay(Date.now())}.json`);
fs.writeFileSync(file, JSON.stringify({ collectedAt: Date.now(), google, webmaster, metrika }));
console.log(file);
