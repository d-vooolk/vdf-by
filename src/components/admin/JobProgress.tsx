"use client";

import { useEffect, useState } from "react";

import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons";

export type JobPhase = "idle" | "running" | "waiting" | "stopping";

export interface JobRun {
  phase: JobPhase;
  waitUntil: number;
  failures: number;
  maxFailures: number;
  startedAt: number;
  startDone: number;
}

export const IDLE_RUN: JobRun = {
  phase: "idle",
  waitUntil: 0,
  failures: 0,
  maxFailures: 5,
  startedAt: 0,
  startDone: 0,
};

function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours) return `${hours} ч ${minutes} мин`;
  if (minutes) return `${minutes} мин ${rest} с`;
  return `${rest} с`;
}

export function JobProgress({
  run,
  done,
  total,
  unit,
  failed,
  note,
  current,
  finishedText = "Выполнено",
}: {
  run: JobRun;
  done: number;
  total: number;
  unit: string;
  failed: number;
  note?: string;
  current: string[];
  finishedText?: string;
}) {
  const active = run.phase !== "idle";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [active]);

  const percent = total ? Math.min(100, (done / total) * 100) : 0;
  const complete = total > 0 && done >= total;
  const elapsed = active ? Math.max(0, now - run.startedAt) : 0;
  const madeNow = active ? done - run.startDone : 0;
  const perMinute = elapsed > 20000 && madeNow > 0 ? madeNow / (elapsed / 60000) : 0;
  const eta = perMinute > 0 ? ((total - done) / perMinute) * 60000 : 0;

  let state: { text: string; tone: string; icon: "spin" | "check" | "alert" | null };
  if (run.phase === "waiting") {
    state = {
      text: `Пауза после ошибки, повтор через ${duration(run.waitUntil - now)} (ошибок подряд: ${run.failures} из ${run.maxFailures})`,
      tone: "text-amber-700",
      icon: "alert",
    };
  } else if (run.phase === "stopping") {
    state = { text: "Останавливаем после текущей порции…", tone: "text-amber-700", icon: "spin" };
  } else if (active) {
    state = { text: "Идёт", tone: "text-brand-800", icon: "spin" };
  } else if (complete) {
    state = { text: finishedText, tone: "text-green-700", icon: "check" };
  } else if (done > 0) {
    state = { text: "Остановлено — можно продолжить", tone: "text-brand-500", icon: null };
  } else {
    state = { text: "Не запускался", tone: "text-brand-400", icon: null };
  }

  return (
    <div className="space-y-2 rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 font-medium ${state.tone}`}>
          {state.icon === "spin" && <SpinnerIcon className="h-4 w-4 animate-spin" />}
          {state.icon === "check" && <CheckIcon className="h-4 w-4" />}
          {state.icon === "alert" && <AlertIcon className="h-4 w-4" />}
          {state.text}
        </span>
        <span className="tnum text-brand-800">
          {done} из {total} {unit}
          {total > 0 && ` · ${Math.floor(percent)}%`}
        </span>
      </div>

      <div
        className="h-2 overflow-hidden rounded-full bg-brand-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${complete ? "bg-green-600" : "bg-brand-700"}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {note && <p className="text-xs text-brand-500">{note}</p>}

      {active && current.length > 0 && (
        <p className="text-xs text-brand-700">
          Сейчас: <span className="font-medium">{current.join(", ")}</span>
        </p>
      )}

      {active && (
        <p className="tnum text-xs text-brand-500">
          Прошло: {duration(elapsed)} · За этот запуск: {madeNow}
          {perMinute > 0 && ` · Скорость: ${perMinute.toFixed(1)} в мин`}
          {eta > 0 && ` · Осталось примерно: ${duration(eta)}`}
        </p>
      )}

      {failed > 0 && (
        <p className="text-xs text-red-700">
          С ошибкой: {failed} — кнопка «Повторить ошибки» вернёт их в очередь
        </p>
      )}
    </div>
  );
}
