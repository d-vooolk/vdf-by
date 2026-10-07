import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";

const DAY_MS = 24 * 60 * 60 * 1000;
const GSC_LAG_DAYS = 3;
const HISTORY_DAYS = 90;
const USER_AGENT = "Mozilla/5.0 (compatible; VDF-SEO-Monitor/1.0; +https://vdf.by/)";
const MAX_SITEMAP_FILES = 40;
const MAX_SITEMAP_BYTES = 40 * 1024 * 1024;
const MAX_HTML_BYTES = 3 * 1024 * 1024;

export const DEFAULT_SEO_SOURCES = {
  gscSite: "sc-domain:vdf.by",
  yandexHost: "https:vdf.by:443",
  metrikaCounter: "112885899",
};

export function isoDay(time) {
  return new Date(time).toISOString().slice(0, 10);
}

export function periods(days, lagDays) {
  const end = Date.now() - lagDays * DAY_MS;
  const start = end - (days - 1) * DAY_MS;
  const previousEnd = start - DAY_MS;
  const previousStart = previousEnd - (days - 1) * DAY_MS;
  return {
    current: { from: isoDay(start), to: isoDay(end) },
    previous: { from: isoDay(previousStart), to: isoDay(previousEnd) },
  };
}

async function requestJson(url, init = {}, timeout = 60000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    const message = body.error?.message ?? body.error_message ?? body.message ?? text.slice(0, 300);
    throw new Error(`${response.status} ${url.split("?")[0]}: ${message}`);
  }
  return body;
}

async function section(task) {
  try {
    return { ok: true, data: await task() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function googleToken(keyFile) {
  const key = JSON.parse(fs.readFileSync(keyFile, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const token = await requestJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  return token.access_token;
}

async function collectGoogle(keyFile, site) {
  const token = await googleToken(keyFile);
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const base = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}`;
  const month = periods(28, GSC_LAG_DAYS);
  const week = periods(7, GSC_LAG_DAYS);
  const history = periods(HISTORY_DAYS, GSC_LAG_DAYS).current;
  const query = (range, dimensions, rowLimit) =>
    requestJson(`${base}/searchAnalytics/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ startDate: range.from, endDate: range.to, dimensions, rowLimit, dataState: "all" }),
    }).then((body) => body.rows ?? []);
  const total = (range) => query(range, [], 1).then((rows) => rows[0] ?? null);

  const [totals, previousTotals, weekTotals, previousWeekTotals, queries, previousQueries, pages, previousPages, devices, daily, sitemaps] =
    await Promise.all([
      total(month.current),
      total(month.previous),
      total(week.current),
      total(week.previous),
      query(month.current, ["query"], 1000),
      query(month.previous, ["query"], 1000),
      query(month.current, ["page"], 500),
      query(month.previous, ["page"], 500),
      query(month.current, ["device"], 10),
      query(history, ["date"], HISTORY_DAYS + 5),
      requestJson(`${base}/sitemaps`, { headers }).then((body) => body.sitemap ?? []),
    ]);

  return {
    dates: month,
    weekDates: week,
    totals,
    previousTotals,
    weekTotals,
    previousWeekTotals,
    queries,
    previousQueries,
    pages,
    previousPages,
    devices,
    daily,
    sitemaps,
  };
}

async function collectWebmaster(token, hostId) {
  const headers = { authorization: `OAuth ${token}` };
  const api = "https://api.webmaster.yandex.net/v4";
  const { user_id: userId } = await requestJson(`${api}/user`, { headers });
  const host = `${api}/user/${userId}/hosts/${encodeURIComponent(hostId)}`;
  const month = periods(28, 1);
  const history = periods(HISTORY_DAYS, 1).current;
  const indicators = ["TOTAL_SHOWS", "TOTAL_CLICKS", "AVG_SHOW_POSITION", "AVG_CLICK_POSITION"];
  const popular = (range) => {
    const params = new URLSearchParams({
      order_by: "TOTAL_SHOWS",
      device_type_indicator: "ALL",
      date_from: range.from,
      date_to: range.to,
      limit: "500",
    });
    for (const indicator of indicators) params.append("query_indicator", indicator);
    return requestJson(`${host}/search-queries/popular?${params}`, { headers }).then((body) => body.queries ?? []);
  };
  const queryHistoryParams = new URLSearchParams({
    device_type_indicator: "ALL",
    date_from: history.from,
    date_to: history.to,
  });
  for (const indicator of ["TOTAL_SHOWS", "TOTAL_CLICKS"]) queryHistoryParams.append("query_indicator", indicator);

  const optional = (promise, fallback) => promise.catch(() => fallback);

  const [summary, diagnostics, sitemaps, userSitemaps, queries, previousQueries, events, inSearch, queryHistory] =
    await Promise.all([
      requestJson(`${host}/summary`, { headers }),
      requestJson(`${host}/diagnostics`, { headers }).then((body) => body.problems ?? {}),
      requestJson(`${host}/sitemaps?limit=100`, { headers }).then((body) => body.sitemaps ?? []),
      optional(
        requestJson(`${host}/user-added-sitemaps?limit=100`, { headers }).then((body) => body.sitemaps ?? []),
        [],
      ),
      popular(month.current),
      popular(month.previous),
      optional(
        requestJson(`${host}/search-urls/events/samples?limit=100`, { headers }).then((body) => body.samples ?? []),
        [],
      ),
      optional(
        requestJson(
          `${host}/search-urls/in-search/history?${new URLSearchParams({ date_from: history.from, date_to: history.to })}`,
          { headers },
        ).then((body) => body.history ?? []),
        [],
      ),
      optional(
        requestJson(`${host}/search-queries/all/history?${queryHistoryParams}`, { headers }).then(
          (body) => body.indicators ?? {},
        ),
        {},
      ),
    ]);

  return { dates: month, summary, diagnostics, sitemaps, userSitemaps, queries, previousQueries, events, inSearch, queryHistory };
}

async function collectMetrika(token, counter) {
  const headers = { authorization: `OAuth ${token}` };
  const month = periods(28, 1);
  const history = periods(HISTORY_DAYS, 1).current;
  const stat = (range, params) =>
    requestJson(
      `https://api-metrika.yandex.net/stat/v1/data?${new URLSearchParams({
        ids: counter,
        date1: range.from,
        date2: range.to,
        accuracy: "full",
        limit: "100",
        lang: "ru",
        ...params,
      })}`,
      { headers },
    ).then((body) => ({ totals: body.totals ?? [], rows: body.data ?? [] }));

  const behaviour = "ym:s:visits,ym:s:users,ym:s:bounceRate,ym:s:pageDepth,ym:s:avgVisitDurationSeconds";
  const organic = "ym:s:lastTrafficSource=='organic'";
  const goals = await requestJson(`https://api-metrika.yandex.net/management/v1/counter/${counter}/goals`, {
    headers,
  }).then((body) => (body.goals ?? []).slice(0, 5).map((goal) => ({ id: goal.id, name: goal.name, type: goal.type })));
  const goalMetrics = goals.map((goal) => `ym:s:goal${goal.id}reaches`).join(",");

  const sources = await stat(month.current, { metrics: behaviour, dimensions: "ym:s:lastTrafficSource" });
  const previousSources = await stat(month.previous, { metrics: behaviour, dimensions: "ym:s:lastTrafficSource" });
  const engines = await stat(month.current, {
    metrics: behaviour,
    dimensions: "ym:s:lastSearchEngineRoot",
    filters: organic,
  });
  const previousEngines = await stat(month.previous, {
    metrics: behaviour,
    dimensions: "ym:s:lastSearchEngineRoot",
    filters: organic,
  });
  const landings = await stat(month.current, {
    metrics: behaviour,
    dimensions: "ym:s:startURL",
    filters: organic,
    sort: "-ym:s:visits",
  });
  const devices = await stat(month.current, { metrics: behaviour, dimensions: "ym:s:deviceCategory" });
  const goalsBySource = goalMetrics
    ? await stat(month.current, { metrics: `ym:s:visits,${goalMetrics}`, dimensions: "ym:s:lastTrafficSource" })
    : null;
  const daily = await stat(history, {
    metrics: "ym:s:visits",
    dimensions: "ym:s:date,ym:s:lastTrafficSource",
    sort: "ym:s:date",
    limit: "1000",
  });

  return { dates: month, goals, sources, previousSources, engines, previousEngines, landings, devices, goalsBySource, daily };
}

export async function collectSearch({ gscKeyFile, yandexTokenFile, gscSite, yandexHost, metrikaCounter } = {}) {
  const sources = {
    gscSite: gscSite || DEFAULT_SEO_SOURCES.gscSite,
    yandexHost: yandexHost || DEFAULT_SEO_SOURCES.yandexHost,
    metrikaCounter: metrikaCounter || DEFAULT_SEO_SOURCES.metrikaCounter,
  };
  const yandexToken = () => fs.readFileSync(yandexTokenFile, "utf8").trim();
  const [google, webmaster, metrika] = await Promise.all([
    section(() => collectGoogle(gscKeyFile, sources.gscSite)),
    section(() => collectWebmaster(yandexToken(), sources.yandexHost)),
    section(() => collectMetrika(yandexToken(), sources.metrikaCounter)),
  ]);
  return { collectedAt: Date.now(), sources, google, webmaster, metrika };
}

async function fetchLimited(url, { timeout = 20000, maxBytes = MAX_HTML_BYTES } = {}) {
  const started = Date.now();
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xml;q=0.9,*/*;q=0.8" },
    signal: AbortSignal.timeout(timeout),
  });
  const firstByteMs = Date.now() - started;
  const chunks = [];
  let size = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) break;
      chunks.push(chunk);
    }
  }
  let buffer = Buffer.concat(chunks);
  const gzipped = url.endsWith(".gz") || buffer.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]));
  if (gzipped) {
    try {
      buffer = zlib.gunzipSync(buffer);
    } catch {
      buffer = Buffer.alloc(0);
    }
  }
  return {
    status: response.status,
    finalUrl: response.url,
    firstByteMs,
    totalMs: Date.now() - started,
    bytes: size,
    text: buffer.toString("utf8"),
    headers: response.headers,
  };
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function metaContent(html, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (key?.toLowerCase() === name) {
      return decodeEntities(tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? "").trim();
    }
  }
  return "";
}

function schemaTypes(html) {
  const types = new Set();
  const collect = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(collect);
    const type = node["@type"];
    if (typeof type === "string") types.add(type);
    if (Array.isArray(type)) type.forEach((entry) => typeof entry === "string" && types.add(entry));
    Object.values(node).forEach(collect);
  };
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collect(JSON.parse(match[1]));
    } catch {
      types.add("невалидный JSON-LD");
    }
  }
  if (/itemtype\s*=\s*["']https?:\/\/schema\.org\//i.test(html)) types.add("microdata");
  return [...types].sort();
}

function inspectHtml(html, origin) {
  const host = new URL(origin).hostname.replace(/^www\./, "");
  const links = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi)].map((match) => match[1]);
  const internal = new Set(
    links.filter((href) => {
      if (href.startsWith("/") && !href.startsWith("//")) return true;
      try {
        return new URL(href).hostname.replace(/^www\./, "") === host;
      } catch {
        return false;
      }
    }),
  );
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => stripTags(match[1])).filter(Boolean);
  const bodyText = stripTags(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " "));
  return {
    title: stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""),
    description: metaContent(html, "description"),
    h1: h1[0] ?? "",
    h1Count: h1.length,
    canonical: html.match(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i)?.[0].match(/href\s*=\s*["']([^"']+)["']/i)?.[1] ?? "",
    robots: metaContent(html, "robots"),
    generator: metaContent(html, "generator"),
    lang: html.match(/<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i)?.[1] ?? "",
    openGraph: Boolean(metaContent(html, "og:title")),
    schema: schemaTypes(html),
    internalLinks: internal.size,
    words: bodyText ? bodyText.split(" ").length : 0,
    analytics: {
      metrika: /mc\.yandex\.ru|ym\(\s*\d+/.test(html),
      google: /googletagmanager\.com|google-analytics\.com|gtag\(/.test(html),
    },
  };
}

const URL_KINDS = [
  { kind: "products", pattern: /\/(product|products|tovar|item|goods|p)\/|\/catalog\/[^/]+\/[^/]+\.html|\/shop\/.+\/.+/i },
  { kind: "articles", pattern: /\/(blog|stati|statii|article|articles|news|novosti|poleznoe|info|stati-i-obzory)\//i },
  { kind: "categories", pattern: /\/(catalog|category|categories|katalog|collection|shop)\//i },
];

async function countSitemaps(roots) {
  const queue = [...new Set(roots)];
  const seen = new Set();
  const urls = new Set();
  const lastmods = [];
  let bytes = 0;
  const errors = [];
  while (queue.length && seen.size < MAX_SITEMAP_FILES && bytes < MAX_SITEMAP_BYTES) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const response = await fetchLimited(url, { timeout: 30000, maxBytes: 20 * 1024 * 1024 });
      bytes += response.bytes;
      if (response.status !== 200) {
        errors.push(`${url}: ${response.status}`);
        continue;
      }
      const isIndex = /<sitemapindex\b/i.test(response.text);
      for (const match of response.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
        const loc = decodeEntities(match[1]);
        if (isIndex) queue.push(loc);
        else urls.add(loc);
      }
      for (const match of response.text.matchAll(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/gi)) lastmods.push(match[1].slice(0, 10));
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const kinds = { products: 0, articles: 0, categories: 0, other: 0 };
  for (const url of urls) {
    const kind = URL_KINDS.find((entry) => entry.pattern.test(url))?.kind ?? "other";
    kinds[kind] += 1;
  }
  lastmods.sort();
  const monthAgo = isoDay(Date.now() - 30 * DAY_MS);
  return {
    files: seen.size,
    urls: urls.size,
    kinds,
    truncated: queue.length > 0,
    newestLastmod: lastmods.at(-1) ?? null,
    updatedLastMonth: lastmods.filter((date) => date >= monthAgo).length,
    errors: errors.slice(0, 5),
  };
}

async function pageSpeed(url, apiKey) {
  const params = new URLSearchParams({ url, strategy: "mobile", category: "performance" });
  if (apiKey) params.set("key", apiKey);
  const body = await requestJson(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {}, 120000);
  const audits = body.lighthouseResult?.audits ?? {};
  const field = body.loadingExperience?.metrics ?? {};
  return {
    score: Math.round((body.lighthouseResult?.categories?.performance?.score ?? 0) * 100),
    lcpMs: audits["largest-contentful-paint"]?.numericValue ?? null,
    cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
    tbtMs: audits["total-blocking-time"]?.numericValue ?? null,
    fieldLcpMs: field.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
    fieldCategory: body.loadingExperience?.overall_category ?? null,
  };
}

export function normalizeDomain(input) {
  const trimmed = String(input).trim();
  if (!trimmed) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function inspectSite(domain, { pagespeedKey, withPageSpeed }) {
  const origin = `https://${domain}/`;
  const result = { domain, checkedAt: Date.now() };
  try {
    const home = await fetchLimited(origin);
    result.home = {
      status: home.status,
      finalUrl: home.finalUrl,
      https: home.finalUrl.startsWith("https://"),
      firstByteMs: home.firstByteMs,
      totalMs: home.totalMs,
      bytes: home.bytes,
      server: home.headers.get("server") ?? "",
      ...inspectHtml(home.text, home.finalUrl || origin),
    };
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }

  const base = new URL(result.home.finalUrl || origin).origin;
  let sitemapRoots = [];
  try {
    const robots = await fetchLimited(`${base}/robots.txt`, { timeout: 15000, maxBytes: 512 * 1024 });
    const text = robots.status === 200 ? robots.text : "";
    sitemapRoots = [...text.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((match) => match[1]);
    result.robots = {
      status: robots.status,
      sitemaps: sitemapRoots.length,
      cleanParam: /^\s*clean-param\s*:/im.test(text),
      host: text.match(/^\s*host\s*:\s*(\S+)/im)?.[1] ?? "",
      blocksAll: /^\s*disallow\s*:\s*\/\s*$/im.test(text.split(/user-agent\s*:\s*\*/i)[1]?.split(/user-agent\s*:/i)[0] ?? ""),
    };
  } catch (error) {
    result.robots = { status: 0, error: error instanceof Error ? error.message : String(error) };
  }

  result.sitemap = await countSitemaps(sitemapRoots.length ? sitemapRoots : [`${base}/sitemap.xml`]);

  if (withPageSpeed) {
    try {
      result.pagespeed = await pageSpeed(result.home.finalUrl || origin, pagespeedKey);
    } catch (error) {
      result.pagespeed = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  return result;
}

async function mapLimited(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function collectCompetitors(domains, { ownDomain = "vdf.by", pagespeedKey = "", withPageSpeed = true } = {}) {
  const list = [...new Set([ownDomain, ...domains].map(normalizeDomain).filter(Boolean))];
  const sites = await mapLimited(list, withPageSpeed && !pagespeedKey ? 2 : 4, (domain) =>
    inspectSite(domain, { pagespeedKey, withPageSpeed }),
  );
  return { collectedAt: Date.now(), ownDomain: normalizeDomain(ownDomain), sites };
}
