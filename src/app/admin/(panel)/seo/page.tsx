import type { Metadata } from "next";
import Link from "next/link";

import { DashboardTabs } from "@/components/admin/DashboardTabs";
import { CompetitorsEditor, SeoRefreshButton } from "@/components/admin/SeoControls";
import {
  BucketTable,
  Change,
  DailyBars,
  DataTable,
  Empty,
  formatDate,
  formatNumber,
  formatPercent,
  MoverTabs,
  Panel,
  RankedTable,
  SectionError,
  Tile,
  type DailyPoint,
} from "@/components/admin/SeoParts";
import {
  getCompetitors,
  gscRows,
  isSeoRunning,
  latestSnapshots,
  movers,
  opportunities,
  POSITION_BUCKETS,
  positionBuckets,
  seoStatus,
  sitePath,
  webmasterRows,
  type CompetitorSite,
  type CompetitorsSnapshot,
  type GoogleData,
  type MetrikaData,
  type MetrikaReport,
  type SearchSnapshot,
  type WebmasterData,
} from "@/lib/seo-data";

export const metadata: Metadata = { title: "SEO" };

const SHOWS = ["показ", "показа", "показов"] as const;

const DIAGNOSTICS: Record<string, string> = {
  NO_SITEMAPS: "Нет обработанных файлов Sitemap",
  NO_SITEMAP_MODIFICATIONS: "Sitemap давно не обновлялся",
  ERRORS_IN_SITEMAPS: "Ошибки в Sitemap",
  ERROR_IN_ROBOTS_TXT: "Ошибки в robots.txt",
  NO_ROBOTS_TXT: "Нет robots.txt",
  URL_ALERT_4XX: "Страницы отвечают 4xx",
  URL_ALERT_5XX: "Страницы отвечают 5xx",
  SOFT_404: "Пустые страницы отвечают 200",
  DOCUMENTS_MISSING_TITLE: "Страницы без title",
  DOCUMENTS_MISSING_DESCRIPTION: "Страницы без description",
  DUPLICATE_PAGES: "Дубли страниц",
  DUPLICATE_CONTENT_ATTRS: "Одинаковые title и description",
  INSIGNIFICANT_CGI_PARAMETER: "Незначащие GET-параметры",
  NOT_MOBILE_FRIENDLY: "Не оптимизировано для мобильных",
  FAVICON_PROBLEM: "Проблема с фавиконом",
  BIG_FAVICON_ABSENT: "Нет большого фавикона",
  NO_REGIONS: "Не задан регион",
  NOT_IN_SPRAV: "Нет в Яндекс Бизнесе",
  SLOW_AVG_RESPONSE_TIME: "Сервер отвечает медленно",
  MAIN_PAGE_ERROR: "Главная страница с ошибкой",
  MAIN_MIRROR_IS_NOT_HTTPS: "Главное зеркало не HTTPS",
  SSL_CERTIFICATE_ERROR: "Ошибка SSL-сертификата",
};

const EXCLUSIONS: Record<string, string> = {
  HTTP_ERROR: "Ошибка HTTP (404 и др.)",
  NOT_CANONICAL: "Неканоническая",
  DUPLICATE: "Дубль",
  LOW_DEMAND: "Малополезная / невостребованная",
  LOW_QUALITY: "Недостаточно качественная",
  REDIRECT_NOTSEARCHABLE: "Редирект",
  ROBOTS_TXT_ERROR: "Запрещена в robots.txt",
  META_NO_INDEX: "Запрещена noindex",
  CLEAN_PARAMS: "Clean-param",
  NOT_MAIN_MIRROR: "Неглавное зеркало",
  OTHER: "Другое",
};

const SEVERITY: Record<string, string> = {
  FATAL: "фатальная",
  CRITICAL: "критичная",
  POSSIBLE_PROBLEM: "возможная проблема",
  RECOMMENDATION: "рекомендация",
};

function PathLink({ path }: { path: string }) {
  return (
    <a href={path} target="_blank" rel="noopener" className="break-all text-brand-700 hover:underline">
      {path}
    </a>
  );
}

function googleDaily(data: GoogleData, field: "clicks" | "impressions"): DailyPoint[] {
  return data.daily.map((row) => ({ date: row.keys[0], value: row[field] }));
}

function webmasterDaily(points: Array<{ date: string; value: number }> | undefined): DailyPoint[] {
  return (points ?? []).map((point) => ({ date: point.date.slice(0, 10), value: point.value ?? 0 }));
}

function metrikaOrganicDaily(data: MetrikaData): DailyPoint[] {
  const byDate = new Map<string, number>();
  for (const row of data.daily.rows) {
    const date = row.dimensions[0]?.name ?? "";
    if (!date) continue;
    const organic = row.dimensions[1]?.id === "organic" ? row.metrics[0] : 0;
    byDate.set(date, (byDate.get(date) ?? 0) + organic);
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

function metrikaValue(report: MetrikaReport, id: string, metric = 0): number | null {
  const row = report.rows.find((entry) => entry.dimensions[0]?.id === id);
  return row ? row.metrics[metric] : null;
}

function Overview({ snapshot }: { snapshot: SearchSnapshot }) {
  const google = snapshot.google.ok ? snapshot.google.data : null;
  const webmaster = snapshot.webmaster.ok ? snapshot.webmaster.data : null;
  const metrika = snapshot.metrika.ok ? snapshot.metrika.data : null;
  const shows = (rows: WebmasterData["queries"]) =>
    rows.reduce((sum, row) => sum + (row.indicators.TOTAL_SHOWS ?? 0), 0);
  const clicks = (rows: WebmasterData["queries"]) =>
    rows.reduce((sum, row) => sum + (row.indicators.TOTAL_CLICKS ?? 0), 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        label="Google: клики за 28 дней"
        value={formatNumber(google?.totals?.clicks ?? null)}
        change={<Change current={google?.totals?.clicks} previous={google?.previousTotals?.clicks ?? 0} />}
        hint="к прошлым 28 дням"
      />
      <Tile
        label="Google: показы"
        value={formatNumber(google?.totals?.impressions ?? null)}
        change={<Change current={google?.totals?.impressions} previous={google?.previousTotals?.impressions ?? 0} />}
        hint={`CTR ${formatPercent(google?.totals?.ctr ?? null, 2)}`}
      />
      <Tile
        label="Google: средняя позиция"
        value={formatNumber(google?.totals?.position ?? null, 1)}
        change={
          <Change
            current={google?.totals?.position}
            previous={google?.previousTotals?.position}
            direction="down-good"
            mode="absolute"
            digits={1}
          />
        }
        hint="меньше — лучше"
      />
      <Tile
        label="Google: клики за 7 дней"
        value={formatNumber(google?.weekTotals?.clicks ?? null)}
        change={<Change current={google?.weekTotals?.clicks} previous={google?.previousWeekTotals?.clicks ?? 0} />}
        hint="к прошлой неделе"
      />
      <Tile
        label="Яндекс: показы за 28 дней"
        value={webmaster ? formatNumber(shows(webmaster.queries)) : "—"}
        change={webmaster && <Change current={shows(webmaster.queries)} previous={shows(webmaster.previousQueries)} />}
        hint="по 500 популярным запросам"
      />
      <Tile
        label="Яндекс: клики"
        value={webmaster ? formatNumber(clicks(webmaster.queries)) : "—"}
        change={webmaster && <Change current={clicks(webmaster.queries)} previous={clicks(webmaster.previousQueries)} />}
      />
      <Tile
        label="Визиты из поиска (Метрика)"
        value={formatNumber(metrika ? metrikaValue(metrika.sources, "organic") : null)}
        change={
          metrika && (
            <Change
              current={metrikaValue(metrika.sources, "organic")}
              previous={metrikaValue(metrika.previousSources, "organic") ?? 0}
            />
          )
        }
        hint="за 28 дней"
      />
      <Tile
        label="Страниц в поиске Яндекса"
        value={formatNumber(webmaster?.summary.searchable_pages_count ?? null)}
        hint={
          webmaster
            ? `исключено ${formatNumber(webmaster.summary.excluded_pages_count ?? 0)} · ИКС ${formatNumber(webmaster.summary.sqi ?? 0)}`
            : undefined
        }
      />
    </div>
  );
}

function Charts({ snapshot }: { snapshot: SearchSnapshot }) {
  const google = snapshot.google.ok ? snapshot.google.data : null;
  const webmaster = snapshot.webmaster.ok ? snapshot.webmaster.data : null;
  const metrika = snapshot.metrika.ok ? snapshot.metrika.data : null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Клики из Google по дням" note="Данные Search Console приходят с задержкой 2–3 дня">
        {google ? <DailyBars points={googleDaily(google, "clicks")} unit={["клик", "клика", "кликов"]} /> : <Empty />}
      </Panel>
      <Panel title="Показы в Google по дням">
        {google ? <DailyBars points={googleDaily(google, "impressions")} unit={SHOWS} /> : <Empty />}
      </Panel>
      <Panel title="Показы в Яндексе по дням">
        {webmaster ? <DailyBars points={webmasterDaily(webmaster.queryHistory.TOTAL_SHOWS)} unit={SHOWS} /> : <Empty />}
      </Panel>
      <Panel title="Визиты из поисковых систем по дням" note="Яндекс.Метрика, все поисковики вместе">
        {metrika ? <DailyBars points={metrikaOrganicDaily(metrika)} unit={["визит", "визита", "визитов"]} /> : <Empty />}
      </Panel>
      <Panel title="Страниц в поиске Яндекса">
        {webmaster ? <DailyBars points={webmasterDaily(webmaster.inSearch)} unit={["страница", "страницы", "страниц"]} summary="last" /> : <Empty />}
      </Panel>
    </div>
  );
}

function Positions({ snapshot }: { snapshot: SearchSnapshot }) {
  const google = snapshot.google.ok ? snapshot.google.data : null;
  const webmaster = snapshot.webmaster.ok ? snapshot.webmaster.data : null;
  const series = [
    ...(google
      ? [
          {
            name: "Google",
            now: positionBuckets(gscRows(google.queries)),
            before: positionBuckets(gscRows(google.previousQueries)),
          },
        ]
      : []),
    ...(webmaster
      ? [
          {
            name: "Яндекс",
            now: positionBuckets(webmasterRows(webmaster.queries)),
            before: positionBuckets(webmasterRows(webmaster.previousQueries)),
          },
        ]
      : []),
  ];
  return (
    <Panel
      title="Сколько запросов на каких позициях"
      note="Число запросов со средней позицией в диапазоне: последние 28 дней и 28 дней до них"
    >
      {series.length ? <BucketTable labels={POSITION_BUCKETS.map((bucket) => bucket.label)} series={series} /> : <Empty />}
    </Panel>
  );
}

function GoogleMovers({ data }: { data: GoogleData }) {
  const pages = movers(gscRows(data.pages, sitePath), gscRows(data.previousPages, sitePath));
  const queries = movers(gscRows(data.queries), gscRows(data.previousQueries));
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Google: страницы — как сдвинулись позиции" note="Средняя позиция страницы за 28 дней против прошлых 28">
        <MoverTabs {...pages} keyHeader="Страница" renderKey={(path) => <PathLink path={path} />} />
      </Panel>
      <Panel title="Google: запросы — как сдвинулись позиции">
        <MoverTabs {...queries} keyHeader="Запрос" />
      </Panel>
    </div>
  );
}

function WebmasterMovers({ data }: { data: WebmasterData }) {
  const queries = movers(webmasterRows(data.queries), webmasterRows(data.previousQueries));
  return (
    <Panel title="Яндекс: запросы — как сдвинулись позиции" note="Средняя позиция показа за 28 дней против прошлых 28">
      <MoverTabs {...queries} keyHeader="Запрос" />
    </Panel>
  );
}

function Opportunities({ snapshot }: { snapshot: SearchSnapshot }) {
  const google = snapshot.google.ok ? opportunities(gscRows(snapshot.google.data.queries), 5) : [];
  const yandex = snapshot.webmaster.ok ? opportunities(webmasterRows(snapshot.webmaster.data.queries), 5) : [];
  const googlePages = snapshot.google.ok ? opportunities(gscRows(snapshot.google.data.pages, sitePath), 5) : [];
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Panel title="Точки роста в Google" note="Позиции 4–20, от 5 показов: ближе всего к топу">
        <RankedTable rows={google.slice(0, 20)} keyHeader="Запрос" />
      </Panel>
      <Panel title="Точки роста в Яндексе" note="Позиции 4–20, от 5 показов">
        <RankedTable rows={yandex.slice(0, 20)} keyHeader="Запрос" />
      </Panel>
      <Panel title="Страницы-кандидаты в Google" note="Позиции 4–20, от 5 показов">
        <RankedTable rows={googlePages.slice(0, 20)} keyHeader="Страница" renderKey={(path) => <PathLink path={path} />} />
      </Panel>
    </div>
  );
}

function WebmasterHealth({ data }: { data: WebmasterData }) {
  const problems = Object.entries(data.diagnostics).filter(([, problem]) => problem.state === "PRESENT");
  const removed = data.events.filter((event) => event.event === "REMOVED_FROM_SEARCH");
  const reasons = new Map<string, number>();
  for (const event of removed) {
    const reason = event.excluded_url_status ?? "OTHER";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Яндекс.Вебмастер: диагностика и Sitemap">
        {problems.length ? (
          <DataTable
            headers={["Проблема", "Важность", "С какого числа"]}
            align={["left", "left", "right"]}
            rows={problems.map(([code, problem]) => [
              DIAGNOSTICS[code] ?? code,
              SEVERITY[problem.severity] ?? problem.severity,
              problem.last_state_update?.slice(0, 10) ?? "—",
            ])}
          />
        ) : (
          <Empty>Актуальных проблем нет.</Empty>
        )}
        <div className="border-t border-brand-100">
          <DataTable
            headers={["Sitemap", "Обработан", "Адресов", "Ошибок"]}
            rows={[
              ...data.sitemaps.map((sitemap) => [
                sitemap.sitemap_url,
                sitemap.last_access_date?.slice(0, 10) ?? "—",
                formatNumber(sitemap.urls_count ?? null),
                formatNumber(sitemap.errors_count ?? 0),
              ]),
              ...data.userSitemaps
                .filter((sitemap) => !data.sitemaps.some((known) => known.sitemap_url === sitemap.sitemap_url))
                .map((sitemap) => [
                  sitemap.sitemap_url,
                  `добавлен ${sitemap.added_date?.slice(0, 10) ?? "—"}, ждёт обработки`,
                  "—",
                  "—",
                ]),
            ]}
          />
        </div>
      </Panel>
      <Panel
        title="Яндекс: недавно исключённые страницы"
        note={`В выборке последних событий: появилось ${data.events.length - removed.length}, исключено ${removed.length}`}
      >
        <DataTable
          headers={["Причина", "Страниц"]}
          rows={[...reasons].sort((a, b) => b[1] - a[1]).map(([reason, count]) => [EXCLUSIONS[reason] ?? reason, count])}
        />
        <div className="border-t border-brand-100">
          <DataTable
            headers={["Страница", "Дата", "Причина"]}
            align={["left", "right", "left"]}
            rows={removed.slice(0, 20).map((event) => [
              <PathLink key="path" path={sitePath(event.url)} />,
              event.event_date?.slice(0, 10) ?? "—",
              <span key="reason" className="text-brand-500">
                {EXCLUSIONS[event.excluded_url_status ?? "OTHER"] ?? event.excluded_url_status}
                {event.target_url ? ` → ${sitePath(event.target_url)}` : ""}
              </span>,
            ])}
          />
        </div>
      </Panel>
    </div>
  );
}

function behaviourRows(report: MetrikaReport, previous?: MetrikaReport, label = (name: string) => name) {
  const before = new Map((previous?.rows ?? []).map((row) => [row.dimensions[0]?.id ?? row.dimensions[0]?.name, row.metrics[0]]));
  return report.rows.map((row) => {
    const [visits, users, bounce, depth, duration] = row.metrics;
    const key = row.dimensions[0]?.id ?? row.dimensions[0]?.name;
    return [
      label(row.dimensions[0]?.name ?? "—"),
      formatNumber(visits),
      previous ? <Change key="change" current={visits} previous={before.get(key) ?? 0} /> : "",
      formatNumber(users),
      `${formatNumber(bounce, 1)}%`,
      formatNumber(depth, 2),
      `${formatNumber(duration / 60, 1)} мин`,
    ];
  });
}

const BEHAVIOUR_HEADERS = ["", "Визиты", "Изменение", "Посетители", "Отказы", "Глубина", "Время"];

function Metrika({ data }: { data: MetrikaData }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Метрика: источники трафика" note="28 дней, изменение к прошлым 28">
        <DataTable headers={BEHAVIOUR_HEADERS} rows={behaviourRows(data.sources, data.previousSources)} />
        <div className="border-t border-brand-100">
          <DataTable headers={BEHAVIOUR_HEADERS} rows={behaviourRows(data.engines, data.previousEngines)} />
        </div>
      </Panel>
      <Panel title="Метрика: цели по источникам">
        {data.goalsBySource && data.goals.length ? (
          <DataTable
            headers={["Источник", "Визиты", ...data.goals.map((goal) => goal.name)]}
            rows={data.goalsBySource.rows.map((row) => [
              row.dimensions[0]?.name ?? "—",
              ...row.metrics.map((value) => formatNumber(value)),
            ])}
          />
        ) : (
          <Empty>Целей в счётчике нет.</Empty>
        )}
      </Panel>
      <div className="xl:col-span-2">
        <Panel title="Метрика: входные страницы из поиска" note="Куда приходят из поисковых систем и что делают дальше">
          <DataTable
            headers={BEHAVIOUR_HEADERS}
            rows={behaviourRows(data.landings, undefined, (name) => sitePath(name)).slice(0, 30).map((row) => [
              <PathLink key="path" path={String(row[0])} />,
              ...row.slice(1),
            ])}
          />
        </Panel>
      </div>
    </div>
  );
}

function speedTone(score: number | undefined): string {
  if (score === undefined) return "text-brand-400";
  if (score >= 90) return "text-green-700";
  if (score >= 50) return "text-amber-700";
  return "text-red-700";
}

function Competitors({
  snapshot,
  previous,
}: {
  snapshot: CompetitorsSnapshot;
  previous?: CompetitorsSnapshot;
}) {
  const before = new Map((previous?.sites ?? []).map((site) => [site.domain, site]));
  const sorted = [...snapshot.sites].sort((a, b) => (b.sitemap?.urls ?? -1) - (a.sitemap?.urls ?? -1));
  const urlsChange = (site: CompetitorSite) => {
    const old = before.get(site.domain)?.sitemap?.urls;
    const now = site.sitemap?.urls;
    if (old === undefined || now === undefined || old === now) return null;
    return <Change current={now} previous={old} mode="absolute" />;
  };

  return (
    <DataTable
      headers={["Сайт", "Страниц в sitemap", "Товары / разделы / статьи", "Обновлено за 30 дн.", "Скорость (моб.)", "LCP", "Ответ", "Разметка", "Главная"]}
      align={["left", "right", "right", "right", "right", "right", "right", "left", "left"]}
      rows={sorted.map((site) => {
        const own = site.domain === snapshot.ownDomain;
        const home = site.home;
        return [
          <div key="domain" className={own ? "font-semibold text-brand-900" : ""}>
            <a href={`https://${site.domain}/`} target="_blank" rel="noopener" className="hover:underline">
              {site.domain}
            </a>
            {own && <span className="ml-1 text-xs text-brand-400">(мы)</span>}
            {site.error && <p className="text-xs text-red-700">{site.error}</p>}
          </div>,
          <span key="urls">
            {formatNumber(site.sitemap?.urls ?? null)} {urlsChange(site)}
          </span>,
          site.sitemap
            ? `${formatNumber(site.sitemap.kinds.products)} / ${formatNumber(site.sitemap.kinds.categories)} / ${formatNumber(site.sitemap.kinds.articles)}`
            : "—",
          site.sitemap ? formatNumber(site.sitemap.updatedLastMonth) : "—",
          <span key="speed" className={`font-semibold ${speedTone(site.pagespeed?.score)}`} title={site.pagespeed?.error}>
            {site.pagespeed?.score !== undefined ? site.pagespeed.score : "—"}
          </span>,
          site.pagespeed?.lcpMs ? `${formatNumber(site.pagespeed.lcpMs / 1000, 1)} с` : "—",
          home ? `${formatNumber(home.firstByteMs)} мс` : "—",
          <span key="schema" className="text-xs text-brand-500">
            {home?.schema.length ? home.schema.slice(0, 6).join(", ") : "нет"}
          </span>,
          home ? (
            <details key="home" className="text-xs">
              <summary className="cursor-pointer text-brand-700">{home.title.slice(0, 60) || "без title"}</summary>
              <dl className="mt-1 space-y-0.5 text-brand-500">
                <div>title: {home.title || "—"}</div>
                <div>description: {home.description || "—"}</div>
                <div>
                  h1: {home.h1 || "—"} {home.h1Count > 1 ? `(${home.h1Count} шт.)` : ""}
                </div>
                <div>
                  слов на главной: {formatNumber(home.words)}, внутренних ссылок: {formatNumber(home.internalLinks)}
                </div>
                <div>
                  Метрика: {home.analytics.metrika ? "да" : "нет"}, Google Analytics: {home.analytics.google ? "да" : "нет"}
                </div>
                {home.generator && <div>CMS: {home.generator}</div>}
                {site.robots?.cleanParam !== undefined && <div>Clean-param в robots: {site.robots.cleanParam ? "да" : "нет"}</div>}
              </dl>
            </details>
          ) : (
            "—"
          ),
        ];
      })}
    />
  );
}

export default function SeoPage() {
  const [search] = latestSnapshots("search", 1);
  const [competitors, previousCompetitors] = latestSnapshots("competitors", 2);
  const searchStatus = seoStatus("search");
  const competitorsStatus = seoStatus("competitors");
  const searchRunning = isSeoRunning("search");
  const competitorsRunning = isSeoRunning("competitors");

  return (
    <div className="space-y-6">
      <div>
        <DashboardTabs active="seo" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-brand-900">SEO</h1>
            <p className="mt-1 text-sm text-brand-500">
              Search Console, Яндекс.Вебмастер и Метрика обновляются каждое утро, конкуренты — раз в неделю.
              Последний сбор: {formatDate(search?.collectedAt)}.
            </p>
          </div>
          <SeoRefreshButton kind="search" running={searchRunning} label="Обновить сейчас" />
        </div>
        {searchStatus.errors.length > 0 && !searchRunning && (
          <ul className="mt-3 space-y-1 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
            {searchStatus.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>

      {!search ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          Данных ещё нет. Нажмите «Обновить сейчас» — сбор занимает около минуты.
        </p>
      ) : (
        <>
          <Overview snapshot={search} />
          <Charts snapshot={search} />
          <Positions snapshot={search} />
          {search.google.ok ? <GoogleMovers data={search.google.data} /> : <Panel title="Google"><SectionError message={search.google.error} /></Panel>}
          {search.webmaster.ok ? (
            <WebmasterMovers data={search.webmaster.data} />
          ) : (
            <Panel title="Яндекс.Вебмастер">
              <SectionError message={search.webmaster.error} />
            </Panel>
          )}
          <Opportunities snapshot={search} />
          {search.webmaster.ok && <WebmasterHealth data={search.webmaster.data} />}
          {search.metrika.ok ? (
            <Metrika data={search.metrika.data} />
          ) : (
            <Panel title="Яндекс.Метрика">
              <SectionError message={search.metrika.error} />
            </Panel>
          )}
        </>
      )}

      <Panel
        title="Конкуренты"
        note={
          <>
            Открытые данные сайтов: размер и свежесть sitemap, скорость мобильной версии по PageSpeed, ответ сервера,
            разметка и главная страница. Последняя проверка: {formatDate(competitors?.collectedAt)}
            {previousCompetitors ? `, сравнение с ${formatDate(previousCompetitors.collectedAt)}` : ""}. Позиции
            конкурентов в выдаче без платного сервиса проверки позиций не получить — см.{" "}
            <Link href="/admin/seo/#positions-note" className="underline">
              примечание
            </Link>
            .
          </>
        }
        actions={<SeoRefreshButton kind="competitors" running={competitorsRunning} label="Проверить конкурентов" />}
      >
        {competitorsStatus.errors.length > 0 && !competitorsRunning && (
          <p className="px-4 py-2 text-xs text-amber-800">Не все сайты ответили: {competitorsStatus.errors.join("; ")}</p>
        )}
        {competitors ? (
          <Competitors snapshot={competitors} previous={previousCompetitors} />
        ) : (
          <Empty>Конкурентов ещё не проверяли — нажмите «Проверить конкурентов», это займёт несколько минут.</Empty>
        )}
        <CompetitorsEditor initial={getCompetitors()} />
        <p id="positions-note" className="border-t border-brand-100 px-4 py-3 text-xs text-brand-400">
          Search Console и Вебмастер отдают позиции только своего сайта. Чтобы видеть, кто из конкурентов стоит выше по
          конкретным запросам, нужен сервис проверки выдачи — например, Topvisor или Yandex Search API. Его можно
          подключить сюда же отдельным блоком.
        </p>
      </Panel>
    </div>
  );
}
