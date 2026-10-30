import type { Metadata } from "next";
import type { ReactNode } from "react";

import { saveManualAiSeoAction } from "@/app/admin/seo-actions";
import { AiSeoCheckButton } from "@/components/admin/AiSeoCheckButton";
import { DashboardTabs } from "@/components/admin/DashboardTabs";
import {
  DailyBars,
  DataTable,
  Empty,
  formatNumber,
  formatPercent,
  Panel,
  SectionError,
  Tile,
  type Unit,
} from "@/components/admin/SeoParts";
import { SeoTabs } from "@/components/admin/SeoTabs";
import {
  AI_ENGINES,
  AI_QUERIES,
  aiReferrals,
  aiSeoReport,
  AUTO_ENGINES,
  GROUP_LABELS,
  hostOf,
  isCheckRunning,
  MANUAL_ENGINES,
  READINESS,
  type BotKind,
  type CheckRow,
  type EngineQuestions,
  type ReadyStatus,
} from "@/lib/ai-seo";
import { minskDay } from "@/lib/traffic";

export const metadata: Metadata = { title: "SEO: AI-SEO" };

const HITS: Unit = ["заход", "захода", "заходов"];

type Level = "ok" | "warn" | "bad" | "none";

const LEVEL_STYLE: Record<Level, string> = {
  ok: "bg-green-100 text-green-800",
  warn: "bg-amber-100 text-amber-800",
  bad: "bg-red-100 text-red-800",
  none: "bg-brand-100 text-brand-500",
};

const LEVEL_TEXT: Record<Level, string> = { ok: "хорошо", warn: "средне", bad: "плохо", none: "нет данных" };

const KIND_LABELS: Record<BotKind, string> = {
  answer: "ответ человеку",
  search: "поиск нейросети",
  train: "обучение",
  other: "прочее",
};

const READY_STYLE: Record<ReadyStatus, { label: string; level: Level }> = {
  done: { label: "сделано", level: "ok" },
  partial: { label: "частично", level: "warn" },
  todo: { label: "не сделано", level: "bad" },
};

function level(value: number | null, good: number, fair: number): Level {
  if (value === null) return "none";
  return value >= good ? "ok" : value >= fair ? "warn" : "bad";
}

function Badge({ level: tone, children }: { level: Level; children: ReactNode }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${LEVEL_STYLE[tone]}`}>{children}</span>;
}

function Mark({ row }: { row: CheckRow | undefined }) {
  if (!row) return <span className="text-brand-300">·</span>;
  if (row.error) {
    return (
      <span className="text-xs text-brand-400" title={row.error}>
        ошибка
      </span>
    );
  }
  if (row.linked) {
    return (
      <span title={row.citedUrl || "ссылка в ответе"}>
        <Badge level="ok">ссылка{row.rank ? ` #${row.rank}` : ""}</Badge>
      </span>
    );
  }
  if (row.mentioned) return <Badge level="warn">назван</Badge>;
  return <span className="text-brand-300">—</span>;
}

function PathLink({ path }: { path: string }) {
  return (
    <a href={path} target="_blank" rel="noopener" className="break-all text-brand-700 hover:underline">
      {path}
    </a>
  );
}

function questionShare(stats: EngineQuestions | null) {
  if (!stats) return null;
  const { impressions, clicks, top5, top5Clicks } = stats.questions;
  return {
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    top5,
    top5Ctr: top5 ? top5Clicks / top5 : 0,
  };
}

export default async function AiSeoPage() {
  const report = aiSeoReport();
  const referrals = await aiReferrals();
  const running = isCheckRunning(report.run);

  const lastScores = AUTO_ENGINES.map((engine) => report.scores.filter((score) => score.engine === engine.id).at(-1)).filter(
    (score): score is NonNullable<typeof score> => Boolean(score?.total),
  );
  const checked = lastScores.reduce((sum, score) => sum + score.total, 0);
  const mentionShare = checked ? lastScores.reduce((sum, score) => sum + score.mentioned, 0) / checked : null;
  const linkShare = checked ? lastScores.reduce((sum, score) => sum + score.linked, 0) / checked : null;

  const referralData = referrals.ok ? referrals.data : null;
  const aiShare = referralData?.organic ? referralData.total / referralData.organic : null;
  const answerHits = report.bots.list.filter((bot) => bot.kind === "answer").reduce((sum, bot) => sum + bot.hits28, 0);
  const ready =
    READINESS.filter((item) => item.status === "done").length +
    READINESS.filter((item) => item.status === "partial").length / 2;
  const lastQuestions = report.questions.at(-1);
  const runs = [...new Set(report.scores.map((score) => score.run))].sort().reverse();
  const run = report.run;

  return (
    <div className="space-y-6">
      <div>
        <DashboardTabs active="seo" />
        <h1 className="text-xl font-semibold text-brand-900">SEO</h1>
        <SeoTabs active="ai" />
        <p className="mt-3 max-w-3xl text-sm text-brand-500">
          Насколько vdf.by видно в ответах нейросетей: ChatGPT, Perplexity, Gemini, Яндекс Нейро и Алиса, Google AI
          Overviews. Главный показатель — назван ли магазин и есть ли ссылка на сайт; рядом объективные сигналы:
          переходы из нейросетей по Метрике и заходы их ботов по логам сервера.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Названы в ответах нейросетей"
          value={formatPercent(mentionShare, 0)}
          change={<Badge level={level(mentionShare, 0.4, 0.15)}>{LEVEL_TEXT[level(mentionShare, 0.4, 0.15)]}</Badge>}
          hint={checked ? `со ссылкой — ${formatPercent(linkShare, 0)}; ${checked} ответов` : "проверка ещё не запускалась"}
        />
        <Tile
          label="Переходы из нейросетей"
          value={formatNumber(referralData?.total ?? null)}
          change={<Badge level={level(aiShare, 0.02, 0.005)}>{LEVEL_TEXT[level(aiShare, 0.02, 0.005)]}</Badge>}
          hint={referralData ? `${formatPercent(aiShare, 1)} от переходов из поиска, с ${referralData.from}` : "Метрика не ответила"}
        />
        <Tile
          label="Нейросети открывали страницы для ответа"
          value={formatNumber(report.bots.to ? answerHits : null)}
          change={
            <Badge level={report.bots.to ? level(answerHits, 100, 20) : "none"}>
              {LEVEL_TEXT[report.bots.to ? level(answerHits, 100, 20) : "none"]}
            </Badge>
          }
          hint="ChatGPT-User, Perplexity-User и др. за 28 дней"
        />
        <Tile
          label="Готовность сайта"
          value={`${formatNumber(ready, ready % 1 ? 1 : 0)} / ${READINESS.length}`}
          change={
            <Badge level={level(ready / READINESS.length, 0.8, 0.5)}>
              {LEVEL_TEXT[level(ready / READINESS.length, 0.8, 0.5)]}
            </Badge>
          }
          hint="чек-лист внизу страницы"
        />
      </div>

      <Panel
        title={`Ответы нейросетей — ${AI_QUERIES.length} запросов`}
        note={
          run &&
          (running
            ? `Идёт проверка: ${run.done} из ${run.total}${run.errors ? `, ошибок ${run.errors}` : ""}. Страница обновляется сама.`
            : `Последний автоматический прогон ${run.run}: ${run.done} ответов${run.errors ? `, ошибок ${run.errors}` : ""}.`)
        }
        actions={<AiSeoCheckButton running={running} />}
      >
        <p className="border-b border-brand-100 px-4 py-3 text-xs text-brand-500">
          Perplexity, ChatGPT и Gemini проверяются автоматически через OpenRouter: модель с поиском в интернете, без
          истории и личных настроек — близко к ответу обычному человеку, но не то же самое, что приложение. Яндекс Нейро,
          Алису и Google AI Overviews API не дают — их отмечают руками в форме ниже. Прогон — 75 запросов, 1–3 минуты,
          около $1 по счёту OpenRouter. Делать раз в месяц, в первые выходные.
        </p>
        {runs.length ? (
          <>
            <h3 className="px-4 pt-3 text-xs font-semibold text-brand-700">Динамика по прогонам</h3>
            <DataTable
              headers={["Дата", ...AI_ENGINES.map((engine) => engine.label)]}
              align={["left", ...AI_ENGINES.map(() => "right" as const)]}
              rows={runs.map((date) => [
                date,
                ...AI_ENGINES.map((engine) => {
                  const score = report.scores.find((entry) => entry.run === date && entry.engine === engine.id);
                  return score?.total
                    ? `назван ${formatPercent(score.mentioned / score.total, 0)}, ссылка ${formatPercent(score.linked / score.total, 0)}`
                    : "·";
                }),
              ])}
            />
            <h3 className="border-t border-brand-100 px-4 pt-3 text-xs font-semibold text-brand-700">
              По запросам — последняя проверка каждой системы
            </h3>
            <DataTable
              headers={["Запрос", ...AI_ENGINES.map((engine) => engine.label)]}
              align={["left", ...AI_ENGINES.map(() => "left" as const)]}
              rows={AI_QUERIES.map(({ query, group }, index) => [
                <div key="query" className="min-w-56">
                  {(index === 0 || AI_QUERIES[index - 1].group !== group) && (
                    <p className="text-[11px] font-semibold tracking-wide text-brand-400 uppercase">{GROUP_LABELS[group]}</p>
                  )}
                  <details>
                    <summary className="cursor-pointer">{query}</summary>
                    {AUTO_ENGINES.map((engine) => {
                      const row = report.latest.get(engine.id)?.get(query);
                      if (!row?.answer) return null;
                      return (
                        <div key={engine.id} className="mt-2 text-xs">
                          <p className="font-semibold text-brand-800">
                            {engine.label} <span className="font-normal text-brand-400">{row.run}</span>
                          </p>
                          <p className="max-h-60 overflow-auto whitespace-pre-wrap text-brand-700">{row.answer}</p>
                          {row.sources.length > 0 && (
                            <p className="text-brand-400">Источники: {row.sources.map(hostOf).filter(Boolean).join(", ")}</p>
                          )}
                        </div>
                      );
                    })}
                  </details>
                </div>,
                ...AI_ENGINES.map((engine) => <Mark key={engine.id} row={report.latest.get(engine.id)?.get(query)} />),
              ])}
            />
            <p className="px-4 py-2 text-xs text-brand-400">
              «ссылка #N» — vdf.by среди источников ответа, N — место в списке; «назван» — упомянут без ссылки. Нажмите на
              запрос — откроются сами ответы.
            </p>
            {report.competitors.length > 0 && (
              <div className="border-t border-brand-100 px-4 py-3 text-xs">
                <p className="font-semibold text-brand-700">На кого нейросети ссылаются вместо нас</p>
                <p className="mt-1 text-brand-600">
                  {report.competitors.map((entry) => `${entry.host} (${entry.answers})`).join(", ")}
                </p>
                <p className="mt-1 text-brand-400">
                  Число — в скольких ответах сайт был источником. Каталоги, маркетплейсы и форумы из этого списка —
                  площадки, где vdf.by нужно появиться.
                </p>
              </div>
            )}
          </>
        ) : (
          <Empty>Проверок ещё не было — нажмите «Проверить ответы нейросетей».</Empty>
        )}
      </Panel>

      <Panel
        title="Ручная отметка: Яндекс Нейро, Алиса, Google AI Overviews"
        note="Задайте каждый запрос в системе без входа в аккаунт, в режиме инкогнито, и отметьте, что в ответе. Пустое — не проверяли. Повторное сохранение за ту же дату перезаписывает отметки."
      >
        <form action={saveManualAiSeoAction} className="space-y-3 px-4 py-3">
          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-brand-500">
              Система
              <select name="engine" className="field mt-1 w-auto py-1.5 text-sm">
                {MANUAL_ENGINES.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-brand-500">
              Дата
              <input type="date" name="run" defaultValue={minskDay()} className="field mt-1 w-auto py-1.5 text-sm" />
            </label>
          </div>
          <div className="divide-y divide-brand-50">
            {AI_QUERIES.map(({ query }, index) => (
              <div key={query} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                <span className="text-brand-900">{query}</span>
                <select name={`q${index}`} defaultValue="" aria-label={query} className="field w-auto py-1 text-xs">
                  <option value="">не проверяли</option>
                  <option value="0">не назван</option>
                  <option value="1">назван без ссылки</option>
                  <option value="2">назван со ссылкой</option>
                </select>
              </div>
            ))}
          </div>
          <label className="block text-xs text-brand-500">
            Кого называли вместо нас — сайты через запятую
            <input name="competitors" placeholder="autosvet.by, onliner.by, drive2.ru" className="field mt-1 text-sm" />
          </label>
          <button type="submit" className="btn-primary py-1.5 text-xs">
            Сохранить отметки
          </button>
        </form>
      </Panel>

      <Panel
        title="Переходы из нейросетей"
        note={
          <>
            Яндекс.Метрика, последние 12 месяцев: визиты с chatgpt.com, perplexity.ai, gemini.google.com, copilot,
            claude.ai, deepseek, alice.yandex.ru и по utm_source=chatgpt.com. Переходы из Яндекс Нейро приходят с ya.ru и
            неотличимы от обычного поиска. Данные обновляются раз в 10 минут.
          </>
        }
      >
        {!referrals.ok ? (
          <SectionError message={referrals.error} />
        ) : (
          <>
            <DataTable
              headers={["Месяц", "Из нейросетей", "Из поиска", "Доля"]}
              rows={[...referrals.data.byMonth].reverse().map((month) => [
                month.month,
                formatNumber(month.ai),
                formatNumber(month.organic),
                month.organic ? formatPercent(month.ai / month.organic, 2) : "—",
              ])}
            />
            {referrals.data.total > 0 ? (
              <div className="grid gap-4 border-t border-brand-100 px-4 py-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-brand-700">Откуда</p>
                  <ul className="mt-1 space-y-0.5">
                    {referrals.data.byHost.map((entry) => (
                      <li key={entry.host}>
                        {entry.host} — <span className="tnum">{formatNumber(entry.visits)}</span>
                      </li>
                    ))}
                  </ul>
                  {referrals.data.goals.length > 0 && (
                    <>
                      <p className="mt-3 text-xs font-semibold text-brand-700">Цели этих визитов</p>
                      <ul className="mt-1 space-y-0.5">
                        {referrals.data.goals.map((goal) => (
                          <li key={goal.name}>
                            {goal.name} — <span className="tnum">{formatNumber(goal.reaches)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-brand-700">Страницы входа</p>
                  <ul className="mt-1 space-y-0.5">
                    {referrals.data.byPage.map((entry) => (
                      <li key={entry.path}>
                        <PathLink path={entry.path} /> — <span className="tnum">{formatNumber(entry.visits)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <Empty>Переходов из нейросетей пока не было.</Empty>
            )}
          </>
        )}
      </Panel>

      <Panel
        title="ИИ-боты на сайте"
        note={
          <>
            Логи nginx{report.bots.from ? `, ${report.bots.from} — ${report.bots.to}` : ""}, сбор каждое утро. Засчитаны
            только настоящие боты: IP из официальных списков OpenAI, Perplexity, Google, Bing, а у остальных — без попыток
            взлома с того же адреса. Под ИИ-ботов массово маскируются сканеры уязвимостей.
          </>
        }
      >
        {report.bots.weekly.length ? (
          <>
            <h3 className="px-4 pt-3 text-xs font-semibold text-brand-700">Открывали страницы для ответа человеку</h3>
            <DailyBars
              points={report.bots.weekly.map((week) => ({ date: week.week, value: week.answer }))}
              unit={HITS}
              step="week"
            />
            <h3 className="border-t border-brand-100 px-4 pt-3 text-xs font-semibold text-brand-700">Все ИИ-боты</h3>
            <DailyBars
              points={report.bots.weekly.map((week) => ({
                date: week.week,
                value: week.answer + week.search + week.train + week.other,
              }))}
              unit={HITS}
              step="week"
            />
            <div className="border-t border-brand-100">
              <DataTable
                headers={["Бот", "Чей", "Зачем", "28 дней", "Страниц", "Всего"]}
                align={["left", "left", "left", "right", "right", "right"]}
                rows={report.bots.list
                  .filter((bot) => bot.hitsAll)
                  .sort((a, b) => b.hits28 - a.hits28)
                  .map((bot) => [
                    <span key="bot" className="font-mono text-xs">
                      {bot.bot}
                    </span>,
                    bot.owner,
                    <span key="kind" className="text-xs text-brand-500">
                      {KIND_LABELS[bot.kind]}
                    </span>,
                    formatNumber(bot.hits28),
                    formatNumber(bot.pages28),
                    formatNumber(bot.hitsAll),
                  ])}
              />
            </div>
            <div className="grid gap-4 border-t border-brand-100 px-4 py-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-brand-700">Страницы, открытые для ответа человеку</p>
                {report.bots.answerPages.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {report.bots.answerPages.map((page) => (
                      <li key={page.path}>
                        <PathLink path={page.path} /> — <span className="tnum">{formatNumber(page.hits)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-brand-400">Пока не было.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-brand-700">Что индексируют поисковые боты нейросетей</p>
                {report.bots.searchPages.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {report.bots.searchPages.map((page) => (
                      <li key={page.path}>
                        <PathLink path={page.path} /> — <span className="tnum">{formatNumber(page.hits)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-brand-400">Пока не было.</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <Empty>Данных ещё нет — сбор раз в сутки, в 7:10 (scripts/ai-seo-collect.mjs).</Empty>
        )}
      </Panel>

      <Panel
        title="Вопросные запросы в поиске"
        note="«Как / почему / сколько / можно ли…» и длинные некоммерческие запросы без бренда, за 28 дней по снимкам Search Console и Вебмастера. На них поиск отвечает нейроответом: если показы растут, а CTR в топ-5 падает — ответ забирает нейросеть, и важно, чтобы она ссылалась на нас."
      >
        {report.questions.length ? (
          <>
            {lastQuestions && (
              <p className="px-4 pt-3 text-xs text-brand-500">
                Последний снимок {lastQuestions.day}: Google —{" "}
                {formatNumber(lastQuestions.google?.questions.queries ?? null)} вопросов из{" "}
                {formatNumber(lastQuestions.google?.total.queries ?? null)} запросов, Яндекс —{" "}
                {formatNumber(lastQuestions.yandex?.questions.queries ?? null)} из{" "}
                {formatNumber(lastQuestions.yandex?.total.queries ?? null)}.
              </p>
            )}
            <DataTable
              headers={["Снимок", "Яндекс: показы", "CTR", "CTR в топ-5", "Google: показы", "CTR", "CTR в топ-5"]}
              rows={[...report.questions]
                .reverse()
                .slice(0, 30)
                .map((day) => {
                  const yandex = questionShare(day.yandex);
                  const google = questionShare(day.google);
                  return [
                    day.day,
                    formatNumber(yandex?.impressions ?? null),
                    formatPercent(yandex?.ctr ?? null),
                    formatPercent(yandex?.top5Ctr ?? null),
                    formatNumber(google?.impressions ?? null),
                    formatPercent(google?.ctr ?? null),
                    formatPercent(google?.top5Ctr ?? null),
                  ];
                })}
            />
          </>
        ) : (
          <Empty>Снимков поиска ещё нет — они собираются каждое утро на вкладке «Обзор».</Empty>
        )}
      </Panel>

      <Panel title="Готовность сайта" note="Список правится в коде (src/lib/ai-seo.ts) по мере выполнения. План — SEO-PLAN.md, раздел AEO / GEO.">
        <DataTable
          headers={["Статус", "Пункт", "Кто"]}
          align={["left", "left", "left"]}
          rows={READINESS.map((item) => [
            <Badge key="status" level={READY_STYLE[item.status].level}>
              {READY_STYLE[item.status].label}
            </Badge>,
            <div key="item">
              {item.item}
              {item.note && <p className="text-xs text-brand-400">{item.note}</p>}
            </div>,
            <span key="who" className="text-xs text-brand-500">
              {item.who}
            </span>,
          ])}
        />
      </Panel>
    </div>
  );
}
