import type { Metadata } from "next";
import Link from "next/link";

import { DashboardTabs } from "@/components/admin/DashboardTabs";
import {
  Change,
  DailyBars,
  DataTable,
  formatDate,
  formatNumber,
  Panel,
  SectionError,
  Tile,
} from "@/components/admin/SeoParts";
import {
  parseRange,
  presetRange,
  TRAFFIC_PRESETS,
  trafficReport,
  type TrafficPreset,
  type TrafficRange,
} from "@/lib/traffic";

export const metadata: Metadata = { title: "Посещаемость" };
export const dynamic = "force-dynamic";

const VISITS = ["визит", "визита", "визитов"] as const;
const PAGE_DAYS = 31;

interface PageProps {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

function isPreset(value: string | undefined): value is TrafficPreset {
  return TRAFFIC_PRESETS.some((preset) => preset.id === value);
}

function dayLabel(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
}

function rangeLabel(range: TrafficRange): string {
  return range.from === range.to ? dayLabel(range.from) : `${dayLabel(range.from)} — ${dayLabel(range.to)}`;
}

export default async function TrafficPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const custom = parseRange(params.from, params.to);
  const preset: TrafficPreset | null = custom ? null : isPreset(params.period) ? params.period : "7";
  const range = custom ?? presetRange(preset ?? "7");
  const result = await trafficReport(range);

  return (
    <div className="space-y-5">
      <DashboardTabs active="traffic" />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-brand-900">Посещаемость</h1>
          <p className="mt-1 text-sm text-brand-500">
            По данным Яндекс.Метрики за {rangeLabel(range)}. Обновляется раз в 5 минут.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TRAFFIC_PRESETS.map((item) => (
          <Link
            key={item.id}
            href={`/admin/traffic/?period=${item.id}`}
            aria-current={preset === item.id ? "page" : undefined}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
              preset === item.id ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-700"
            }`}
          >
            {item.label}
          </Link>
        ))}
        <form action="/admin/traffic/" className="flex flex-wrap items-center gap-2 text-sm">
          <input type="date" name="from" defaultValue={range.from} className="field py-1.5 text-sm" required />
          <span className="text-brand-400">—</span>
          <input type="date" name="to" defaultValue={range.to} className="field py-1.5 text-sm" required />
          <button type="submit" className="btn-ghost py-1.5 text-sm">
            Показать
          </button>
        </form>
      </div>

      {!result.ok ? (
        <div className="card">
          <SectionError message={result.error} />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile
              label="Посетители"
              value={formatNumber(result.report.totals.users)}
              change={<Change current={result.report.totals.users} previous={result.report.previousTotals.users} />}
              hint={`к ${rangeLabel(result.report.previous)}`}
            />
            <Tile
              label="Визиты"
              value={formatNumber(result.report.totals.visits)}
              change={<Change current={result.report.totals.visits} previous={result.report.previousTotals.visits} />}
            />
            <Tile
              label="Просмотры страниц"
              value={formatNumber(result.report.totals.pageviews)}
              change={
                <Change current={result.report.totals.pageviews} previous={result.report.previousTotals.pageviews} />
              }
            />
          </div>

          {result.report.days.length > 1 && (
            <Panel title="Визиты по дням">
              <DailyBars
                points={result.report.days.map((day) => ({ date: day.date, value: day.visits }))}
                unit={VISITS}
              />
            </Panel>
          )}

          {result.report.days.length > 1 && result.report.days.length <= PAGE_DAYS && (
            <Panel title="По дням">
              <DataTable
                headers={["День", "Посетители", "Визиты", "Просмотры"]}
                rows={[...result.report.days].reverse().map((day) => [
                  dayLabel(day.date),
                  formatNumber(day.users),
                  formatNumber(day.visits),
                  formatNumber(day.pageviews),
                ])}
              />
            </Panel>
          )}

          <Panel
            title="Самые просматриваемые страницы"
            note={`Первые ${result.report.pages.length} по числу просмотров. Данные получены ${formatDate(result.report.fetchedAt)}.`}
          >
            <DataTable
              headers={["Страница", "Просмотры", "Посетители"]}
              rows={result.report.pages.map((page) => [
                <a
                  key={page.path}
                  href={page.path}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-brand-700 hover:underline"
                >
                  {page.path}
                </a>,
                formatNumber(page.pageviews),
                formatNumber(page.users),
              ])}
            />
          </Panel>
        </>
      )}
    </div>
  );
}
