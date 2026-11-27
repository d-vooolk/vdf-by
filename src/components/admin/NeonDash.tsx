import Link from "next/link";
import type { ReactNode } from "react";

import { plural } from "@/lib/format";

import { Empty, formatNumber, type DailyPoint, type Unit } from "./SeoParts";

export type NeonTone = "lime" | "cyan" | "amber" | "violet" | "pink" | "sky";

function smoothPath(coords: Array<[number, number]>): string {
  return coords
    .map(([x, y], index) => {
      if (index === 0) return `M${x},${y}`;
      const [prevX, prevY] = coords[index - 1];
      const middle = (prevX + x) / 2;
      return `C${middle},${prevY} ${middle},${y} ${x},${y}`;
    })
    .join(" ");
}

function Sparkline({ values, tone }: { values: number[]; tone: NeonTone }) {
  if (values.length < 2) return null;
  const width = 200;
  const height = 44;
  const max = Math.max(...values, 1);
  const coords = values.map((value, index): [number, number] => [
    (index / (values.length - 1)) * width,
    height - 4 - (value / max) * (height - 8),
  ]);
  const line = smoothPath(coords);
  const gradient = `neon-spark-${tone}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="-mx-3 mt-auto block h-11 w-[calc(100%+1.5rem)] pt-2 sm:-mx-4 sm:w-[calc(100%+2rem)]" aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.4} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${gradient})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" className="neon-glow" />
    </svg>
  );
}

export function NeonDelta({
  current,
  previous,
  period = "К предыдущим 7 дням",
}: {
  current: number;
  previous: number;
  period?: string;
}) {
  if (previous === 0) return current > 0 ? <span className="neon-delta neon-lime">новое</span> : null;
  const change = Math.round(((current - previous) / previous) * 100);
  const tone = change >= 0 ? "neon-lime" : "neon-pink";
  return (
    <span className={`neon-delta ${tone}`} title={period}>
      {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%
    </span>
  );
}

export function NeonTile({
  tone,
  icon,
  label,
  value,
  badge,
  hint,
  spark,
  href,
}: {
  tone: NeonTone;
  icon: ReactNode;
  label: string;
  value: string;
  badge?: ReactNode;
  hint?: ReactNode;
  spark?: number[];
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className="neon-icon max-sm:h-7 max-sm:w-7">{icon}</span>
        <span className="min-w-0 text-[10px] leading-tight font-bold tracking-wide text-brand-500 uppercase sm:text-[11px] sm:tracking-wider">{label}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="tnum text-xl leading-tight font-extrabold tracking-tight text-brand-900 sm:text-[1.75rem]">{value}</span>
        {badge}
      </div>
      {hint && <p className="mt-1 text-xs text-brand-400">{hint}</p>}
      {spark && <Sparkline values={spark} tone={tone} />}
    </>
  );
  const className = `card neon-tile neon-${tone} flex min-h-32 min-w-0 flex-col px-3 pt-3 sm:min-h-36 sm:px-4 sm:pt-4 ${spark ? "" : "pb-3 sm:pb-4"}`;

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function NeonLine({ points, unit, tone }: { points: DailyPoint[]; unit: Unit; tone: NeonTone }) {
  if (!points.length) return <Empty />;
  const width = 720;
  const height = 200;
  const max = Math.max(...points.map((point) => point.value), 1);
  const ceiling = Math.max(2, Math.ceil(max * 1.15));
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const average = total / points.length;
  const last = points.length - 1;
  const xShare = (index: number) => (last === 0 ? 0.5 : index / last);
  const yShare = (value: number) => value / ceiling;
  const coords = points.map((point, index): [number, number] => [xShare(index) * width, height - yShare(point.value) * height]);
  const line = smoothPath(coords);
  const label = (date: string) => date.slice(8, 10) + "." + date.slice(5, 7);
  const weekday = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("ru-RU", { weekday: "short", timeZone: "UTC" });
  const withUnit = (value: number) => `${formatNumber(value)} ${plural(Math.round(value), ...unit)}`;
  const gradient = `neon-line-${tone}`;

  return (
    <figure className={`neon-${tone} px-4 pt-4 pb-3`}>
      <div className="flex gap-2">
        <div className="tnum flex h-48 flex-col justify-between pb-0 text-right text-[11px] text-brand-400">
          <span>{formatNumber(ceiling)}</span>
          <span>{formatNumber(ceiling / 2, ceiling % 2 ? 1 : 0)}</span>
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="relative h-48"
            role="img"
            aria-label={`По дням с ${label(points[0].date)} по ${label(points[last].date)}, всего ${withUnit(total)}, максимум ${formatNumber(max)}`}
          >
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-brand-100" />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-brand-100" />
            <div className="absolute inset-x-0 bottom-0 border-t border-brand-200" />
            <div
              className="neon-average absolute inset-x-0 border-t border-dashed"
              style={{ bottom: `${yShare(average) * 100}%` }}
              title={`В среднем ${formatNumber(average, 1)} в день`}
            />
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
              <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={`${line} L${coords[last][0]},${height} L${coords[0][0]},${height} Z`} fill={`url(#${gradient})`} />
              <path
                d={line}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="neon-glow"
              />
            </svg>
            {points.map((point, index) => {
              const align = index < points.length / 4 ? "left-0" : index > (points.length * 3) / 4 ? "right-0" : "left-1/2 -translate-x-1/2";
              return (
                <div
                  key={point.date}
                  className="group absolute inset-y-0 -translate-x-1/2"
                  style={{ left: `${xShare(index) * 100}%`, width: `${100 / Math.max(1, last)}%` }}
                >
                  <div className="absolute inset-y-0 left-1/2 border-l border-brand-200 opacity-0 group-hover:opacity-100" />
                  <span
                    className={`neon-dot absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-current ${
                      index === last ? "" : "opacity-0 group-hover:opacity-100"
                    }`}
                    style={{ bottom: `${yShare(point.value) * 100}%` }}
                  />
                  <span
                    className={`pointer-events-none absolute -top-1 z-10 -translate-y-full rounded-lg border border-brand-100 bg-white px-2 py-1 text-xs whitespace-nowrap text-brand-900 opacity-0 shadow-md group-hover:opacity-100 ${align}`}
                  >
                    <span className="text-brand-400">
                      {weekday(point.date)}, {label(point.date)}
                    </span>{" "}
                    <span className="tnum font-semibold">{withUnit(point.value)}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-brand-400">
            <span>{label(points[0].date)}</span>
            <span>{label(points[Math.floor(last / 2)].date)}</span>
            <span>{label(points[last].date)}</span>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-xs text-brand-400">
        Всего за {points.length} дн.: <span className="tnum font-medium text-brand-700">{withUnit(total)}</span>, в среднем{" "}
        <span className="tnum font-medium text-brand-700">{formatNumber(average, 1)}</span> в день — пунктирная линия. Наведите на график — покажется
        день.
      </figcaption>
    </figure>
  );
}

export interface NeonBarRow {
  label: string;
  value: number;
  valueText: string;
  note?: string;
}

export function NeonBars({ rows, tone }: { rows: NeonBarRow[]; tone: NeonTone }) {
  if (!rows.length) return <Empty />;
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ul className={`neon-${tone} space-y-3 px-4 py-3`}>
      {rows.map((row) => (
        <li key={row.label} className="text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium text-brand-900">{row.label}</span>
            <span className="tnum shrink-0 font-semibold text-brand-900">{row.valueText}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-brand-100">
            {row.value > 0 && (
              <div className="neon-bar h-full rounded-full bg-current" style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} />
            )}
          </div>
          {row.note && <p className="tnum mt-0.5 text-brand-400">{row.note}</p>}
        </li>
      ))}
    </ul>
  );
}
