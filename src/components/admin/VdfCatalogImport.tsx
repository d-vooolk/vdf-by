"use client";

import { useEffect, useRef, useState } from "react";

import { AlertIcon, SpinnerIcon } from "@/components/icons";
import type { ImportLogEntry, ImportSummary } from "@/lib/vdf-product-import";

const ENDPOINT = "/admin/api/vdf-catalog/";
const PAUSE_AFTER_ERROR_MS = 15000;
const MAX_ERRORS = 5;

interface Response {
  import?: ImportSummary | null;
  imports?: ImportSummary[];
  outcome?: ImportLogEntry | null;
  log?: ImportLogEntry[];
  error?: string;
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Response> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = (await response.json().catch(() => ({}))) as Response;
  if (!response.ok) throw new Error(data.error ?? `Сервер ответил ${response.status}`);
  return data;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const STATUS_TEXT: Record<ImportLogEntry["status"], string> = {
  queued: "в очереди",
  importing: "создаётся",
  imported: "создан",
  skipped: "пропущен",
  error: "ошибка",
};

function ImportRow({
  item,
  onChange,
}: {
  item: ImportSummary;
  onChange: (next: ImportSummary | null, removed?: boolean) => void;
}) {
  const [running, setRunning] = useState(false);
  const [lanes, setLanes] = useState(2);
  const [error, setError] = useState("");
  const [log, setLog] = useState<ImportLogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const stopRef = useRef(false);

  const { counts } = item;
  const handled = counts.imported + counts.skipped + counts.error;
  const waiting = counts.queued + counts.importing;
  const percent = item.total ? (handled / item.total) * 100 : 0;

  const loadLog = async () => {
    const data = await call("import-summary", { id: item.id });
    setLog(data.log ?? []);
    if (data.import) onChange(data.import);
  };

  const run = async () => {
    stopRef.current = false;
    setRunning(true);
    setError("");
    let finished = false;
    try {
      await call("release-import", { id: item.id });
      const lane = async () => {
        let failures = 0;
        while (!stopRef.current && !finished) {
          try {
            const data = await call("import", { id: item.id });
            failures = 0;
            if (data.import) onChange(data.import);
            if (!data.outcome) {
              finished = true;
              return;
            }
            const outcome = data.outcome;
            setLog((current) => [outcome, ...current].slice(0, 300));
          } catch (reason) {
            failures += 1;
            setError((reason as Error).message);
            if (failures >= MAX_ERRORS) {
              stopRef.current = true;
              return;
            }
            await wait(PAUSE_AFTER_ERROR_MS);
          }
        }
      };
      await Promise.all(Array.from({ length: lanes }, lane));
    } finally {
      setRunning(false);
      loadLog().catch(() => {});
    }
  };

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-brand-900">
            №{item.id} · {item.fileName} → {item.categoryName}
          </p>
          <p className="tnum text-xs text-brand-500">
            Создано: {counts.imported} · пропущено: {counts.skipped} · ошибок: {counts.error} ·
            осталось: {waiting} из {item.total} · {item.unit}
            {item.photos ? " · с фото" : " · без фото"}
            {item.faq ? " · с вопросами-ответами" : ""}
          </p>
          {running && item.current.length > 0 && (
            <p className="truncate text-xs text-brand-700">Сейчас: {item.current.join(", ")}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {waiting > 0 &&
            (running ? (
              <button type="button" onClick={() => (stopRef.current = true)} className="btn-secondary py-1.5 text-sm">
                <SpinnerIcon className="h-4 w-4 animate-spin" /> Остановить
              </button>
            ) : (
              <>
                <select
                  value={lanes}
                  onChange={(event) => setLanes(Number(event.target.value))}
                  className="field w-auto py-1.5 text-sm"
                  aria-label="Параллельно"
                >
                  <option value={1}>1 поток</option>
                  <option value={2}>2 потока</option>
                  <option value={3}>3 потока</option>
                </select>
                <button type="button" onClick={run} className="btn-primary py-1.5 text-sm">
                  {handled ? "Продолжить" : "Создать товары"}
                </button>
              </>
            ))}
          {counts.error > 0 && !running && (
            <button
              type="button"
              onClick={async () => onChange((await call("retry-import", { id: item.id })).import ?? null)}
              className="btn-ghost py-1.5 text-sm"
            >
              Повторить ошибки ({counts.error})
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowLog(!showLog);
              if (!showLog && !log.length) loadLog().catch(() => {});
            }}
            className="btn-ghost py-1.5 text-sm"
          >
            {showLog ? "Скрыть журнал" : "Журнал"}
          </button>
          {!running && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Удалить загрузку №${item.id} из списка? Созданные товары останутся.`)) return;
                await call("delete-import", { id: item.id });
                onChange(null, true);
              }}
              className="btn-ghost py-1.5 text-sm text-red-700"
            >
              Удалить
            </button>
          )}
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-brand-100">
        <div
          className={`h-full rounded-full ${waiting === 0 ? "bg-green-600" : "bg-brand-700"}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-700">
          <AlertIcon className="h-3.5 w-3.5" /> {error}
        </p>
      )}
      {showLog && (
        <ul className="max-h-72 divide-y divide-brand-100 overflow-y-auto rounded-xl border border-brand-100 text-sm">
          {log.length === 0 && <li className="px-3 py-2 text-brand-400">Пока пусто</li>}
          {log.map((entry, index) => (
            <li key={`${entry.title}-${index}`} className="px-3 py-1.5">
              <span
                className={
                  entry.status === "error"
                    ? "text-red-700"
                    : entry.status === "skipped"
                      ? "text-brand-500"
                      : "text-green-700"
                }
              >
                {STATUS_TEXT[entry.status]}
              </span>{" "}
              {entry.productId ? (
                <a href={`/admin/products/${entry.productId}/`} target="_blank" rel="noreferrer" className="underline">
                  {entry.title}
                </a>
              ) : (
                entry.title
              )}
              {entry.message && <span className="text-amber-700"> — {entry.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function VdfCatalogImport({
  categories,
  aiReady,
}: {
  categories: Array<{ id: string; name: string }>;
  aiReady: boolean;
}) {
  const [imports, setImports] = useState<ImportSummary[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [unit, setUnit] = useState<"шт." | "комплект">("шт.");
  const [photos, setPhotos] = useState(true);
  const [faq, setFaq] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    call("imports")
      .then((data) => setImports(data.imports ?? []))
      .catch(() => {});
  }, []);

  const upload = async () => {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("categoryId", categoryId);
      form.set("unit", unit);
      form.set("photos", photos ? "1" : "0");
      form.set("faq", faq ? "1" : "0");
      const response = await fetch("/admin/api/upload/vdf-table/", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as Response;
      if (!response.ok || !data.import) throw new Error(data.error ?? `Сервер ответил ${response.status}`);
      setImports((current) => [data.import!, ...current]);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-4 p-5">
        <h2 className="font-semibold text-brand-900">3. Загрузить таблицу на сайт</h2>
        <p className="text-sm text-brand-500">
          Название и характеристики — как в таблице. Описание переписывает нейросеть. Розница в ₽ —
          цена, опт в ₽ — себестоимость, обе с привязкой к курсу. Левое и правое стекло склеиваются
          в один товар с выбором «Правое / Левое / Пара». Товары с уже заведённым артикулом,
          OEM-номером или названием пропускаются. Наличие — по остатку, то есть сначала «нет в
          наличии».
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="label">Файл таблицы (.xlsx)</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="label">Раздел магазина</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="field py-2 text-sm">
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-sm text-brand-800">
          <span className="flex items-center gap-3">
            Единица:
            {(["шт.", "комплект"] as const).map((value) => (
              <label key={value} className="flex items-center gap-1.5">
                <input type="radio" name="unit" checked={unit === value} onChange={() => setUnit(value)} />
                {value}
              </label>
            ))}
          </span>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={photos} onChange={(event) => setPhotos(event.target.checked)} />
            Загружать фото
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={faq} onChange={(event) => setFaq(event.target.checked)} />
            Вопросы-ответы нейросетью
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={upload}
            disabled={!file || !categoryId || uploading || !aiReady}
            className="btn-primary py-2 text-sm"
          >
            {uploading && <SpinnerIcon className="h-4 w-4 animate-spin" />}
            Прочитать таблицу
          </button>
          <span className="text-xs text-brand-500">
            После чтения появится строка загрузки — товары начнут создаваться по кнопке «Создать
            товары».
          </span>
        </div>
        {!aiReady && <p className="text-xs text-red-700">Нейросеть не подключена: нет AI_API_KEY.</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>

      {imports.length > 0 && (
        <ul className="card divide-y divide-brand-100">
          {imports.map((item) => (
            <ImportRow
              key={item.id}
              item={item}
              onChange={(next, removed) =>
                setImports((current) =>
                  removed
                    ? current.filter((entry) => entry.id !== item.id)
                    : current.map((entry) => (entry.id === item.id && next ? next : entry)),
                )
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
