#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "../src/lib/env.mjs";
import { collectSearch, isoDay } from "../src/lib/seo-collect.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECRETS_DIR = env("SEO_SECRETS_DIR", path.join(ROOT, "var"));
const OUT_DIR = env("SEO_REPORT_DIR", path.join(ROOT, "var", "seo"));
const PERIOD_DAYS = 28;
const GSC_LAG_DAYS = 3;

const number = (value, digits = 0) =>
  value === null || value === undefined || Number.isNaN(value)
    ? "—"
    : Number(value).toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const percent = (value, digits = 1) => (value === null || value === undefined ? "—" : `${number(value * 100, digits)}%`);

function change(current, previous) {
  if (!previous) return current ? "новое" : "—";
  const delta = ((current - previous) / previous) * 100;
  return `${delta >= 0 ? "+" : ""}${number(delta, 0)}%`;
}

function table(headers, rows) {
  if (!rows.length) return "_нет данных_\n";
  const escape = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n") + "\n";
}

function shortUrl(url) {
  return String(url).replace(/^https?:\/\/(www\.)?vdf\.by/, "") || "/";
}

function failed(result) {
  return `> Не удалось получить данные: ${result.error}\n`;
}

function googleSection(result) {
  if (!result.ok) return `## Google Search Console\n\n${failed(result)}`;
  const data = result.data;
  const lines = [`## Google Search Console\n`, `Период: ${data.dates.current.from} — ${data.dates.current.to}, сравнение с ${data.dates.previous.from} — ${data.dates.previous.to}.\n`];
  const t = data.totals ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const p = data.previousTotals ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  lines.push(
    table(
      ["Показатель", "Сейчас", "Было", "Изменение"],
      [
        ["Клики", number(t.clicks), number(p.clicks), change(t.clicks, p.clicks)],
        ["Показы", number(t.impressions), number(p.impressions), change(t.impressions, p.impressions)],
        ["CTR", percent(t.ctr, 2), percent(p.ctr, 2), ""],
        ["Средняя позиция", number(t.position, 1), number(p.position, 1), ""],
      ],
    ),
  );

  const previous = new Map(data.previousQueries.map((row) => [row.keys[0], row]));
  lines.push(`### Запросы — топ-50 по показам\n`);
  lines.push(
    table(
      ["Запрос", "Показы", "Клики", "CTR", "Позиция", "Позиция была"],
      data.queries.slice(0, 50).map((row) => [
        row.keys[0],
        number(row.impressions),
        number(row.clicks),
        percent(row.ctr),
        number(row.position, 1),
        number(previous.get(row.keys[0])?.position, 1),
      ]),
    ),
  );

  const opportunities = data.queries
    .filter((row) => row.position >= 4 && row.position <= 20 && row.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30);
  lines.push(`### Точки роста — позиции 4–20, от 20 показов\n`);
  lines.push(`Запросы, по которым сайт уже близко к первой странице или к её верху: поднять их — самый дешёвый прирост трафика.\n`);
  lines.push(
    table(
      ["Запрос", "Показы", "Клики", "Позиция"],
      opportunities.map((row) => [row.keys[0], number(row.impressions), number(row.clicks), number(row.position, 1)]),
    ),
  );

  const lowCtr = data.queries
    .filter((row) => row.position <= 5 && row.impressions >= 30 && row.ctr < 0.03)
    .slice(0, 20);
  lines.push(`### Высокая позиция, мало кликов — позиция до 5, CTR ниже 3%\n`);
  lines.push(`Обычно лечится заголовком и описанием сниппета.\n`);
  lines.push(
    table(
      ["Запрос", "Показы", "CTR", "Позиция"],
      lowCtr.map((row) => [row.keys[0], number(row.impressions), percent(row.ctr), number(row.position, 1)]),
    ),
  );

  lines.push(`### Страницы — топ-40 по показам\n`);
  lines.push(
    table(
      ["Страница", "Показы", "Клики", "CTR", "Позиция"],
      data.pages
        .slice(0, 40)
        .map((row) => [shortUrl(row.keys[0]), number(row.impressions), number(row.clicks), percent(row.ctr), number(row.position, 1)]),
    ),
  );

  lines.push(`### Устройства\n`);
  lines.push(
    table(
      ["Устройство", "Показы", "Клики", "CTR", "Позиция"],
      data.devices.map((row) => [row.keys[0], number(row.impressions), number(row.clicks), percent(row.ctr), number(row.position, 1)]),
    ),
  );

  lines.push(`### Страны\n`);
  lines.push(
    table(
      ["Страна", "Показы", "Клики", "Позиция"],
      data.countries.map((row) => [row.keys[0], number(row.impressions), number(row.clicks), number(row.position, 1)]),
    ),
  );

  lines.push(`### Sitemap в Google\n`);
  lines.push(
    table(
      ["Файл", "Прочитан", "Ошибки", "Предупреждения", "Отправлено адресов"],
      data.sitemaps.map((sitemap) => [
        shortUrl(sitemap.path),
        sitemap.lastDownloaded?.slice(0, 10) ?? "—",
        sitemap.errors ?? 0,
        sitemap.warnings ?? 0,
        (sitemap.contents ?? []).map((entry) => `${entry.type}: ${entry.submitted}`).join(", ") || "—",
      ]),
    ),
  );
  return lines.join("\n");
}

function yandexIndicator(row, name) {
  return row.indicators?.[name] ?? null;
}

function webmasterSection(result) {
  if (!result.ok) return `## Яндекс.Вебмастер\n\n${failed(result)}`;
  const data = result.data;
  const lines = [`## Яндекс.Вебмастер\n`, `Период запросов: ${data.dates.current.from} — ${data.dates.current.to}.\n`];
  const summary = data.summary;
  lines.push(
    table(
      ["Показатель", "Значение"],
      [
        ["ИКС", number(summary.sqi)],
        ["Страниц в поиске", number(summary.searchable_pages_count)],
        ["Исключено страниц", number(summary.excluded_pages_count)],
        [
          "Проблемы сайта",
          Object.entries(summary.site_problems ?? {})
            .map(([level, count]) => `${level}: ${count}`)
            .join(", ") || "нет",
        ],
      ],
    ),
  );

  const problems = Object.entries(data.diagnostics).filter(([, problem]) => problem.state === "PRESENT");
  lines.push(`### Диагностика — актуальные проблемы\n`);
  lines.push(
    table(
      ["Проблема", "Важность", "С какого числа"],
      problems.map(([code, problem]) => [code, problem.severity, problem.last_state_update?.slice(0, 10) ?? "—"]),
    ),
  );

  const totalShows = (rows) => rows.reduce((sum, row) => sum + (yandexIndicator(row, "TOTAL_SHOWS") ?? 0), 0);
  const totalClicks = (rows) => rows.reduce((sum, row) => sum + (yandexIndicator(row, "TOTAL_CLICKS") ?? 0), 0);
  lines.push(`### Итого по популярным запросам (до 500)\n`);
  lines.push(
    table(
      ["Показатель", "Сейчас", "Было", "Изменение"],
      [
        ["Показы", number(totalShows(data.queries)), number(totalShows(data.previousQueries)), change(totalShows(data.queries), totalShows(data.previousQueries))],
        ["Клики", number(totalClicks(data.queries)), number(totalClicks(data.previousQueries)), change(totalClicks(data.queries), totalClicks(data.previousQueries))],
      ],
    ),
  );

  const previous = new Map(data.previousQueries.map((row) => [row.query_text, row]));
  lines.push(`### Запросы — топ-50 по показам\n`);
  lines.push(
    table(
      ["Запрос", "Показы", "Клики", "CTR", "Позиция показа", "Позиция была"],
      data.queries.slice(0, 50).map((row) => {
        const shows = yandexIndicator(row, "TOTAL_SHOWS") ?? 0;
        const clicks = yandexIndicator(row, "TOTAL_CLICKS") ?? 0;
        return [
          row.query_text,
          number(shows),
          number(clicks),
          shows ? percent(clicks / shows) : "—",
          number(yandexIndicator(row, "AVG_SHOW_POSITION"), 1),
          number(previous.has(row.query_text) ? yandexIndicator(previous.get(row.query_text), "AVG_SHOW_POSITION") : null, 1),
        ];
      }),
    ),
  );

  const opportunities = data.queries
    .filter((row) => {
      const position = yandexIndicator(row, "AVG_SHOW_POSITION");
      return position >= 4 && position <= 20 && (yandexIndicator(row, "TOTAL_SHOWS") ?? 0) >= 20;
    })
    .slice(0, 30);
  lines.push(`### Точки роста — позиции 4–20, от 20 показов\n`);
  lines.push(
    table(
      ["Запрос", "Показы", "Клики", "Позиция"],
      opportunities.map((row) => [
        row.query_text,
        number(yandexIndicator(row, "TOTAL_SHOWS")),
        number(yandexIndicator(row, "TOTAL_CLICKS")),
        number(yandexIndicator(row, "AVG_SHOW_POSITION"), 1),
      ]),
    ),
  );

  lines.push(`### Sitemap в Яндексе\n`);
  lines.push(
    table(
      ["Файл", "Прочитан", "Адресов", "Ошибок"],
      data.sitemaps.map((sitemap) => [
        shortUrl(sitemap.sitemap_url),
        sitemap.last_access_date?.slice(0, 10) ?? "—",
        number(sitemap.urls_count),
        number(sitemap.errors_count),
      ]),
    ),
  );

  const removed = data.events.filter((event) => event.event === "REMOVED_FROM_SEARCH");
  const appeared = data.events.filter((event) => event.event === "APPEARED_IN_SEARCH");
  lines.push(`### Последние изменения в поиске\n`);
  lines.push(`Появилось в выборке: ${appeared.length}, исключено: ${removed.length}.\n`);
  const reasons = new Map();
  for (const event of removed) {
    const reason = event.excluded_url_status ?? "—";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  lines.push(table(["Причина исключения", "Страниц"], [...reasons].sort((a, b) => b[1] - a[1])));
  lines.push(
    table(
      ["Исключённая страница", "Дата", "Причина", "Куда ведёт"],
      removed
        .slice(0, 30)
        .map((event) => [
          shortUrl(event.url),
          event.event_date?.slice(0, 10) ?? "—",
          event.excluded_url_status ?? "—",
          event.target_url ? shortUrl(event.target_url) : "",
        ]),
    ),
  );
  return lines.join("\n");
}

function metrikaRows(report, labelOf = (row) => row.dimensions[0]?.name ?? "—") {
  return report.rows.map((row) => [labelOf(row), ...row.metrics]);
}

function metrikaSection(result) {
  if (!result.ok) return `## Яндекс.Метрика\n\n${failed(result)}`;
  const data = result.data;
  const lines = [`## Яндекс.Метрика\n`, `Период: ${data.dates.current.from} — ${data.dates.current.to}, сравнение с ${data.dates.previous.from} — ${data.dates.previous.to}.\n`];
  const behaviourRow = ([label, visits, users, bounce, depth, duration], previousVisits) => [
    label,
    number(visits),
    previousVisits === undefined ? "—" : change(visits, previousVisits),
    number(users),
    `${number(bounce, 1)}%`,
    number(depth, 2),
    `${number(duration / 60, 1)} мин`,
  ];
  const headers = ["", "Визиты", "Изменение", "Посетители", "Отказы", "Глубина", "Время"];

  const previousSources = new Map(metrikaRows(data.previousSources).map((row) => [row[0], row[1]]));
  lines.push(`### Источники трафика\n`);
  lines.push(table(headers, metrikaRows(data.sources).map((row) => behaviourRow(row, previousSources.get(row[0]) ?? 0))));

  const previousEngines = new Map(metrikaRows(data.previousEngines).map((row) => [row[0], row[1]]));
  lines.push(`### Поисковый трафик по системам\n`);
  lines.push(table(headers, metrikaRows(data.engines).map((row) => behaviourRow(row, previousEngines.get(row[0]) ?? 0))));

  lines.push(`### Входные страницы из поиска — топ-40\n`);
  lines.push(
    table(
      headers,
      metrikaRows(data.landings, (row) => shortUrl(row.dimensions[0]?.name ?? "—"))
        .slice(0, 40)
        .map((row) => behaviourRow(row, undefined)),
    ),
  );

  lines.push(`### Устройства\n`);
  lines.push(table(headers, metrikaRows(data.devices).map((row) => behaviourRow(row, undefined))));

  if (data.goalsBySource && data.goals.length) {
    lines.push(`### Цели по источникам\n`);
    lines.push(
      table(
        ["Источник", "Визиты", ...data.goals.map((goal) => goal.name)],
        metrikaRows(data.goalsBySource).map(([label, visits, ...reaches]) => [label, number(visits), ...reaches.map((value) => number(value))]),
      ),
    );
  } else {
    lines.push(`### Цели\n\n_целей в счётчике нет_\n`);
  }
  return lines.join("\n");
}

const { google, webmaster, metrika } = await collectSearch({ secretsDir: SECRETS_DIR });
for (const [name, result] of [["Search Console", google], ["Вебмастер", webmaster], ["Метрика", metrika]]) {
  if (!result.ok) console.error(`[${name}] ${result.error}`);
}

const today = isoDay(Date.now());
const report = [
  `# SEO-сводка vdf.by — ${today}\n`,
  `Сравниваются два периода по ${PERIOD_DAYS} дней. У Google данные запаздывают на ${GSC_LAG_DAYS} дня, поэтому его период сдвинут.\n`,
  googleSection(google),
  webmasterSection(webmaster),
  metrikaSection(metrika),
].join("\n");

fs.mkdirSync(OUT_DIR, { recursive: true });
const reportPath = path.join(OUT_DIR, `report-${today}.md`);
const rawPath = path.join(OUT_DIR, `raw-${today}.json`);
fs.writeFileSync(reportPath, report);
fs.writeFileSync(rawPath, JSON.stringify({ google, webmaster, metrika }, null, 2));

console.log(`Отчёт: ${reportPath}`);
console.log(`Сырые данные: ${rawPath}`);
if (![google, webmaster, metrika].every((result) => result.ok)) process.exitCode = 1;
