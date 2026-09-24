"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons";
import type { FrameSummary, ImportOutcome } from "@/lib/frame-import";

type Task = "discover" | "read" | "import";
type Phase = "running" | "waiting" | "stopping";

interface StepResponse {
  summary?: FrameSummary;
  processed?: string[];
  outcome?: ImportOutcome | null;
  rematch?: { frames: number; productsUpdated: number };
  retried?: number;
  error?: string;
}

interface Run {
  task: Task;
  phase: Phase;
  startedAt: number;
  startDone: number;
  waitUntil: number;
  errors: number;
}

interface Finish {
  task: Task;
  text: string;
  at: number;
}

interface Progress {
  done: number;
  total: number;
  failed: number;
  unit: string;
  note: string;
  current: string[];
}

const ENDPOINT = "/admin/api/frames/";
const PAUSE_AFTER_ERROR_MS = 15000;
const MAX_STEP_ERRORS = 5;
const POLL_MS = 3000;

async function call(action: string, extra: Record<string, unknown> = {}): Promise<StepResponse> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = (await response.json().catch(() => ({}))) as StepResponse;
  if (!response.ok) throw new Error(data.error ?? `Сервер ответил ${response.status}`);
  return data;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours) return `${hours} ч ${minutes} мин`;
  if (minutes) return `${minutes} мин ${rest} с`;
  return `${rest} с`;
}

function progressOf(task: Task, summary: FrameSummary): Progress {
  const { counts } = summary;
  if (task === "discover") {
    return {
      done: summary.categoriesDone,
      total: summary.categoriesDone + summary.categoriesPending,
      failed: 0,
      unit: "разделов",
      note: `Рамок найдено: ${summary.total}${summary.expected ? ` из ${summary.expected} на сайте` : ""}. Общее число разделов растёт по ходу обхода — вложенные разделы открываются по мере продвижения.`,
      current: summary.nextCategories,
    };
  }
  if (task === "read") {
    return {
      done: summary.total - counts.new,
      total: summary.total,
      failed: counts.read_error,
      unit: "карточек",
      note: `Готово к импорту: ${counts.read + counts.importing + counts.imported + counts.import_error}${counts.skipped ? `, пропущено (не рамки): ${counts.skipped}` : ""}`,
      current: summary.nextFrames,
    };
  }
  const pool = counts.read + counts.importing + counts.imported + counts.import_error;
  return {
    done: counts.imported + counts.import_error,
    total: pool,
    failed: counts.import_error,
    unit: "товаров",
    note: `Создано: ${counts.imported}, ждут очереди: ${counts.read}`,
    current: summary.importing,
  };
}

function StepProgress({
  task,
  summary,
  run,
  finish,
  now,
}: {
  task: Task;
  summary: FrameSummary;
  run: Run | null;
  finish: Finish | null;
  now: number;
}) {
  const progress = progressOf(task, summary);
  const active = run?.task === task ? run : null;
  const percent = progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0;
  const complete = progress.total > 0 && progress.done >= progress.total;

  const elapsed = active ? now - active.startedAt : 0;
  const madeNow = active ? progress.done - active.startDone : 0;
  const perMinute = active && elapsed > 20000 && madeNow > 0 ? madeNow / (elapsed / 60000) : 0;
  const left = progress.total - progress.done;
  const eta = perMinute > 0 ? (left / perMinute) * 60000 : 0;

  let state: { text: string; tone: string; icon: "spin" | "check" | "alert" | null };
  if (active?.phase === "waiting") {
    state = {
      text: `Пауза после ошибки, повтор через ${duration(active.waitUntil - now)} (ошибок подряд: ${active.errors} из ${MAX_STEP_ERRORS})`,
      tone: "text-amber-700",
      icon: "alert",
    };
  } else if (active?.phase === "stopping") {
    state = { text: "Останавливаем после текущей порции…", tone: "text-amber-700", icon: "spin" };
  } else if (active) {
    state = { text: "Идёт", tone: "text-brand-800", icon: "spin" };
  } else if (finish?.task === task) {
    state = { text: finish.text, tone: "text-green-700", icon: "check" };
  } else if (complete) {
    state = { text: "Выполнено", tone: "text-green-700", icon: "check" };
  } else if (progress.done > 0) {
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
          {progress.done} из {progress.total} {progress.unit}
          {progress.total > 0 && ` · ${Math.floor(percent)}%`}
        </span>
      </div>

      <div
        className="h-2 overflow-hidden rounded-full bg-brand-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            complete ? "bg-green-600" : "bg-brand-700"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="text-xs text-brand-500">{progress.note}</p>

      {active && progress.current.length > 0 && (
        <p className="text-xs text-brand-700">
          Сейчас: <span className="font-medium">{progress.current.join(", ")}</span>
        </p>
      )}

      {active && (
        <p className="tnum text-xs text-brand-500">
          Прошло: {duration(elapsed)} · За этот запуск: {madeNow}
          {perMinute > 0 && ` · Скорость: ${perMinute.toFixed(1)} в мин`}
          {eta > 0 && ` · Осталось примерно: ${duration(eta)}`}
        </p>
      )}

      {progress.failed > 0 && (
        <p className="text-xs text-red-700">
          С ошибкой: {progress.failed} — кнопка «Повторить ошибки» вернёт их в очередь
        </p>
      )}
    </div>
  );
}

export function FrameImporter({
  initial,
  categories,
  defaultCategoryId,
  aiReady,
}: {
  initial: FrameSummary;
  categories: Array<{ id: string; name: string }>;
  defaultCategoryId: string;
  aiReady: boolean;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(initial);
  const [run, setRun] = useState<Run | null>(null);
  const [finish, setFinish] = useState<Finish | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [log, setLog] = useState<ImportOutcome[]>([]);
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [lanes, setLanes] = useState(2);
  const stopRef = useRef(false);

  const busy = run !== null;
  const task = run?.task ?? null;

  useEffect(() => {
    if (!busy) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => {
      call("summary")
        .then((data) => {
          if (data.summary) setSummary(data.summary);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [busy]);

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const begin = (name: Task) => {
    stopRef.current = false;
    setError("");
    setMessage("");
    setFinish(null);
    setNow(Date.now());
    setRun({
      task: name,
      phase: "running",
      startedAt: Date.now(),
      startDone: progressOf(name, summary).done,
      waitUntil: 0,
      errors: 0,
    });
  };

  const end = (name: Task, text: string) => {
    setRun(null);
    setFinish({ task: name, text, at: Date.now() });
    router.refresh();
  };

  const pauseAfterError = async (failures: number) => {
    setRun((current) =>
      current
        ? { ...current, phase: "waiting", errors: failures, waitUntil: Date.now() + PAUSE_AFTER_ERROR_MS }
        : current,
    );
    await wait(PAUSE_AFTER_ERROR_MS);
    setRun((current) =>
      current ? { ...current, phase: stopRef.current ? "stopping" : "running" } : current,
    );
  };

  const loop = async (name: "discover" | "read", finished: (next: FrameSummary) => boolean) => {
    begin(name);
    let failures = 0;
    let result = "Остановлено";
    while (!stopRef.current) {
      try {
        const data = await call(name);
        failures = 0;
        setRun((current) => (current ? { ...current, errors: 0 } : current));
        if (data.summary) {
          setSummary(data.summary);
          if (finished(data.summary)) {
            result = "Готово";
            break;
          }
        }
      } catch (reason) {
        failures += 1;
        setError((reason as Error).message);
        if (failures >= MAX_STEP_ERRORS) {
          result = "Остановлено: слишком много ошибок подряд";
          break;
        }
        await pauseAfterError(failures);
      }
    }
    end(name, result);
  };

  const discover = () =>
    loop("discover", (next) => next.categoriesPending === 0 && next.categoriesDone > 0);

  const read = () => loop("read", (next) => next.counts.new === 0);

  const runImport = async (limit: number | null) => {
    begin("import");
    let started = 0;
    let finishedAll = false;
    let gaveUp = false;

    const lane = async () => {
      let failures = 0;
      while (!stopRef.current && !finishedAll && (limit === null || started < limit)) {
        started += 1;
        try {
          const data = await call("import", { categoryId });
          failures = 0;
          if (data.summary) setSummary(data.summary);
          if (!data.outcome) {
            finishedAll = true;
            return;
          }
          const outcome = data.outcome;
          setLog((current) => [outcome, ...current].slice(0, 200));
        } catch (reason) {
          started -= 1;
          failures += 1;
          setError((reason as Error).message);
          if (failures >= MAX_STEP_ERRORS) {
            gaveUp = true;
            stopRef.current = true;
            return;
          }
          await pauseAfterError(failures);
        }
      }
    };

    try {
      await call("release");
      const count = limit === null ? lanes : Math.min(lanes, limit);
      await Promise.all(Array.from({ length: count }, lane));
    } finally {
      end(
        "import",
        gaveUp
          ? "Остановлено: слишком много ошибок подряд"
          : finishedAll
            ? "Все готовые рамки обработаны"
            : limit !== null && !stopRef.current
              ? `Пробная партия готова (${limit})`
              : "Остановлено",
      );
    }
  };

  const stop = () => {
    stopRef.current = true;
    setRun((current) => (current ? { ...current, phase: "stopping" } : current));
  };

  const simple = async (action: "retry" | "rematch") => {
    setError("");
    setMessage("");
    try {
      const data = await call(action);
      if (data.summary) setSummary(data.summary);
      if (action === "retry") setMessage(`Вернули в очередь: ${data.retried ?? 0}`);
      if (data.rematch) {
        setMessage(
          `Пересопоставлено рамок: ${data.rematch.frames}, привязки добавлены товарам: ${data.rematch.productsUpdated}`,
        );
      }
      router.refresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const { counts } = summary;
  const errors = counts.read_error + counts.import_error;
  const stopButton = (name: Task) =>
    task === name && (
      <button
        type="button"
        onClick={stop}
        disabled={run?.phase === "stopping"}
        className="btn-secondary py-2 text-sm"
      >
        Остановить
      </button>
    );

  return (
    <div className="space-y-4">
      {busy && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <AlertIcon className="h-4 w-4 shrink-0" />
          Работа идёт, пока открыта эта вкладка. Если закрыть — прогресс сохранится, продолжить
          можно той же кнопкой.
        </p>
      )}

      <div className="card space-y-3 p-5">
        <h2 className="font-semibold text-brand-900">1. Собрать список рамок</h2>
        <p className="text-sm text-brand-500">
          Обходим разделы «Переходные рамки» на vdf-light.ru. Сайт ограничивает частоту запросов,
          поэтому разделы открываются по одному, с паузой.
        </p>
        <StepProgress task="discover" summary={summary} run={run} finish={finish} now={now} />
        {summary.truncated.length > 0 && (
          <p className="text-xs text-amber-700">
            В этих разделах больше 24 рамок, часть могла не попасть в список:{" "}
            {summary.truncated.join(", ")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={discover}
            disabled={busy}
            className="btn-secondary py-2 text-sm"
          >
            {summary.categoriesDone === 0
              ? "Собрать список"
              : summary.categoriesPending > 0
                ? "Продолжить сбор"
                : "Собрать заново новые"}
          </button>
          {stopButton("discover")}
        </div>
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="font-semibold text-brand-900">2. Прочитать карточки рамок</h2>
        <p className="text-sm text-brand-500">
          Открываем страницу каждой рамки: машины, описание, характеристики и фото. Машины сразу
          сопоставляются со справочником.
        </p>
        <StepProgress task="read" summary={summary} run={run} finish={finish} now={now} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={read}
            disabled={busy || counts.new === 0}
            className="btn-secondary py-2 text-sm"
          >
            {summary.total - counts.new > 0 && counts.new > 0 ? "Продолжить чтение" : "Прочитать"}
          </button>
          {stopButton("read")}
        </div>
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="font-semibold text-brand-900">3. Создать товары</h2>
        <p className="text-sm text-brand-500">
          Для каждой рамки: рерайт описания и вопросы-ответы нейросетью, фото с vdf-light.ru,
          привязка к машинам. Бренд VDF, единица — комплект, цена не указана, нет в наличии,
          артикул как на vdf-light.ru. Уже созданные артикулы пропускаются.
        </p>
        <StepProgress task="import" summary={summary} run={run} finish={finish} now={now} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="label">Раздел</span>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={busy}
              className="field py-2 text-sm"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Параллельно</span>
            <select
              value={lanes}
              onChange={(event) => setLanes(Number(event.target.value))}
              disabled={busy}
              className="field py-2 text-sm"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => runImport(5)}
            disabled={busy || !aiReady || !categoryId || counts.read === 0}
            className="btn-secondary py-2 text-sm"
          >
            Создать 5 для проверки
          </button>
          <button
            type="button"
            onClick={() => runImport(null)}
            disabled={busy || !aiReady || !categoryId || counts.read === 0}
            className="btn-primary py-2 text-sm"
          >
            Создать все ({counts.read})
          </button>
          {stopButton("import")}
        </div>
        {!aiReady && (
          <p className="text-xs text-red-700">Нейросеть не подключена: нет AI_API_KEY.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => simple("retry")}
          disabled={busy || errors === 0}
          className="btn-ghost py-2 text-sm"
        >
          Повторить ошибки ({errors})
        </button>
        <button
          type="button"
          onClick={() => simple("rematch")}
          disabled={busy || summary.total === 0}
          className="btn-ghost py-2 text-sm"
        >
          Пересопоставить машины
        </button>
        <a href="/admin/api/frames/csv/?kind=types" className="btn-ghost py-2 text-sm">
          Скачать таблицу по типам (CSV)
        </a>
        <a href="/admin/api/frames/csv/?kind=frames" className="btn-ghost py-2 text-sm">
          Скачать все рамки (CSV)
        </a>
      </div>

      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && (
        <p className="flex items-start gap-1.5 text-sm text-red-700" role="alert">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          Последняя ошибка: {error}
        </p>
      )}

      {log.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-brand-900">
            Созданные за этот запуск <span className="tnum text-brand-400">{log.length}</span>
          </h3>
          <ul className="card max-h-80 divide-y divide-brand-100 overflow-y-auto text-sm">
            {log.map((entry, index) => (
              <li key={`${entry.url}-${index}`} className="px-4 py-2">
                <span className="font-medium text-brand-900">{entry.article}</span>{" "}
                {entry.error ? (
                  <span className="text-red-700">— {entry.error}</span>
                ) : (
                  <>
                    <a
                      href={`/admin/products/${entry.productId}/`}
                      className="text-brand-600 underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      открыть товар
                    </a>
                    {entry.warnings.length > 0 && (
                      <span className="text-amber-700"> — {entry.warnings.join("; ")}</span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
