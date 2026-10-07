import type { ReactNode } from "react";

import { plural } from "@/lib/format";
import type { Mover, RankedRow } from "@/lib/seo-data";

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "—" : `${formatNumber(value * 100, digits)}%`;
}

export function formatDate(time: number | string | null | undefined): string {
  if (!time) return "—";
  const date = new Date(time);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Minsk",
  });
}

type Direction = "up-good" | "down-good";

function changeTone(delta: number, direction: Direction): string {
  if (Math.abs(delta) < 1e-9) return "text-brand-400";
  const good = direction === "up-good" ? delta > 0 : delta < 0;
  return good ? "text-green-700" : "text-red-700";
}

export function Change({
  current,
  previous,
  direction = "up-good",
  mode = "percent",
  digits = 0,
}: {
  current: number | null | undefined;
  previous: number | null | undefined;
  direction?: Direction;
  mode?: "percent" | "absolute";
  digits?: number;
}) {
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined || (mode === "percent" && previous === 0)) {
    return <span className="text-xs text-brand-400">{previous === 0 && current > 0 ? "раньше не было" : "нет сравнения"}</span>;
  }
  const delta = mode === "percent" ? ((current - previous) / previous) * 100 : current - previous;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return (
    <span className={`tnum text-xs font-medium ${changeTone(delta, direction)}`}>
      {sign}
      {formatNumber(Math.abs(delta), digits)}
      {mode === "percent" ? "%" : ""}
    </span>
  );
}

export function Tile({
  label,
  value,
  hint,
  change,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  change?: ReactNode;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs text-brand-400">{label}</p>
      <p className="tnum mt-1 text-2xl font-semibold text-brand-900">{value}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-2 text-xs text-brand-400">
        {change}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}

export function Panel({
  title,
  note,
  children,
  actions,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-brand-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-brand-900">{title}</h2>
          {note && <p className="mt-0.5 text-xs text-brand-400">{note}</p>}
        </div>
        {actions}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function SectionError({ message }: { message: string }) {
  return <p className="px-4 py-3 text-sm text-red-700">Не удалось получить данные: {message}</p>;
}

export function Empty({ children = "Нет данных" }: { children?: ReactNode }) {
  return <p className="px-4 py-3 text-sm text-brand-400">{children}</p>;
}

export function DataTable({
  headers,
  rows,
  align,
}: {
  headers: string[];
  rows: ReactNode[][];
  align?: Array<"left" | "right">;
}) {
  if (!rows.length) return <Empty />;
  const alignment = (index: number) => (align?.[index] ?? (index === 0 ? "left" : "right")) === "right";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand-100 text-xs text-brand-400">
            {headers.map((header, index) => (
              <th
                key={header}
                scope="col"
                className={`px-4 py-2 font-medium ${alignment(index) ? "text-right" : "text-left"}`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-50">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-brand-50/60">
              {row.map((cell, index) => (
                <td
                  key={index}
                  className={`px-4 py-1.5 align-top ${
                    alignment(index) ? "tnum text-right whitespace-nowrap text-brand-700" : "text-brand-900"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface DailyPoint {
  date: string;
  value: number;
}

export type Unit = readonly [string, string, string];

function withUnit(value: number, unit: Unit): string {
  return `${formatNumber(value)} ${plural(Math.round(value), ...unit)}`;
}

export function DailyBars({
  points,
  unit,
  summary = "sum",
}: {
  points: DailyPoint[];
  unit: Unit;
  summary?: "sum" | "last";
}) {
  if (!points.length) return <Empty />;
  const width = 720;
  const height = 140;
  const top = 8;
  const bottom = 20;
  const max = Math.max(...points.map((point) => point.value), 1);
  const slot = width / points.length;
  const barWidth = Math.max(1, slot - 2);
  const plotHeight = height - top - bottom;
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const label = (date: string) => date.slice(8, 10) + "." + date.slice(5, 7);
  const ticks = [0, Math.floor(points.length / 2), points.length - 1];

  return (
    <figure className="px-4 py-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-36 w-full"
        role="img"
        aria-label={`По дням с ${label(points[0].date)} по ${label(points[points.length - 1].date)}, ${
          summary === "sum" ? `всего ${withUnit(total, unit)}` : `сейчас ${withUnit(points[points.length - 1].value, unit)}`
        }, максимум ${formatNumber(max)}`}
        preserveAspectRatio="none"
      >
        <line x1={0} x2={width} y1={top + plotHeight} y2={top + plotHeight} className="stroke-brand-200" strokeWidth={1} />
        <line x1={0} x2={width} y1={top} y2={top} className="stroke-brand-100" strokeWidth={1} strokeDasharray="3 3" />
        {points.map((point, index) => {
          const barHeight = point.value > 0 ? Math.max(2, (point.value / max) * plotHeight) : 0;
          const x = index * slot + (slot - barWidth) / 2;
          return (
            <g key={point.date} className="group">
              <rect x={index * slot} y={top} width={slot} height={plotHeight} className="fill-transparent group-hover:fill-brand-50" />
              {barHeight > 0 && (
                <rect
                  x={x}
                  y={top + plotHeight - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx={Math.min(2, barWidth / 2)}
                  className="fill-brand-600 group-hover:fill-brand-900"
                />
              )}
              <title>{`${label(point.date)}: ${withUnit(point.value, unit)}`}</title>
            </g>
          );
        })}
        {ticks.map((index) => (
          <text
            key={index}
            x={Math.min(width - 2, Math.max(2, index * slot + slot / 2))}
            y={height - 4}
            textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
            className="fill-brand-400 text-[11px]"
          >
            {label(points[index].date)}
          </text>
        ))}
        <text x={2} y={top + 10} className="fill-brand-400 text-[11px]">
          {formatNumber(max)}
        </text>
      </svg>
      <figcaption className="mt-1 text-xs text-brand-400">
        {summary === "sum" ? "Всего за период: " : "Сейчас: "}
        <span className="tnum font-medium text-brand-700">
          {withUnit(summary === "sum" ? total : points[points.length - 1].value, unit)}
        </span>
        . Наведите на столбик — покажется день и значение.
      </figcaption>
    </figure>
  );
}

export function BucketTable({
  labels,
  series,
}: {
  labels: readonly string[];
  series: Array<{ name: string; now: number[]; before: number[] }>;
}) {
  return (
    <DataTable
      headers={["Позиции", ...series.flatMap((entry) => [`${entry.name}: сейчас`, "было"])]}
      rows={labels.map((label, index) => [
        label,
        ...series.flatMap((entry) => [
          <span key="now" className="font-semibold text-brand-900">
            {formatNumber(entry.now[index])}
          </span>,
          <span key="before" className="text-brand-400">
            {formatNumber(entry.before[index])}
          </span>,
        ]),
      ])}
    />
  );
}

function positionDelta(delta: number) {
  const tone = delta > 0 ? "text-green-700" : "text-red-700";
  return (
    <span className={`font-medium ${tone}`}>
      {delta > 0 ? "▲" : "▼"} {formatNumber(Math.abs(delta), 1)}
    </span>
  );
}

export function MoversTable({
  rows,
  keyHeader,
  renderKey = (key) => key,
}: {
  rows: Mover[];
  keyHeader: string;
  renderKey?: (key: string) => ReactNode;
}) {
  return (
    <DataTable
      headers={[keyHeader, "Позиция", "Была", "Сдвиг", "Показы", "Клики"]}
      rows={rows.map((row) => [
        renderKey(row.key),
        formatNumber(row.position, 1),
        formatNumber(row.previousPosition, 1),
        positionDelta(row.delta),
        formatNumber(row.impressions),
        formatNumber(row.clicks),
      ])}
    />
  );
}

export function RankedTable({
  rows,
  keyHeader,
  renderKey = (key) => key,
}: {
  rows: RankedRow[];
  keyHeader: string;
  renderKey?: (key: string) => ReactNode;
}) {
  return (
    <DataTable
      headers={[keyHeader, "Позиция", "Показы", "Клики", "CTR"]}
      rows={rows.map((row) => [
        renderKey(row.key),
        formatNumber(row.position, 1),
        formatNumber(row.impressions),
        formatNumber(row.clicks),
        row.impressions ? formatPercent(row.clicks / row.impressions) : "—",
      ])}
    />
  );
}

export function MoverTabs({
  up,
  down,
  added,
  lost,
  keyHeader,
  renderKey,
  limit = 15,
}: {
  up: Mover[];
  down: Mover[];
  added: RankedRow[];
  lost: RankedRow[];
  keyHeader: string;
  renderKey?: (key: string) => ReactNode;
  limit?: number;
}) {
  const groups = [
    { title: `Поднялись (${up.length})`, body: <MoversTable rows={up.slice(0, limit)} keyHeader={keyHeader} renderKey={renderKey} /> },
    { title: `Опустились (${down.length})`, body: <MoversTable rows={down.slice(0, limit)} keyHeader={keyHeader} renderKey={renderKey} /> },
    { title: `Появились (${added.length})`, body: <RankedTable rows={added.slice(0, limit)} keyHeader={keyHeader} renderKey={renderKey} /> },
    { title: `Пропали (${lost.length})`, body: <RankedTable rows={lost.slice(0, limit)} keyHeader={keyHeader} renderKey={renderKey} /> },
  ];
  return (
    <div className="divide-y divide-brand-100">
      {groups.map((group, index) => (
        <details key={group.title} open={index < 2} className="group/details">
          <summary className="cursor-pointer px-4 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">
            {group.title}
          </summary>
          {group.body}
        </details>
      ))}
    </div>
  );
}
