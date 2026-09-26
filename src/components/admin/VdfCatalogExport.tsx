"use client";

import { useEffect, useRef, useState } from "react";

import { AlertIcon, SpinnerIcon } from "@/components/icons";
import type { ExportSummary, VdfCategoryNode } from "@/lib/vdf-catalog";

const ENDPOINT = "/admin/api/vdf-catalog/";
const PAUSE_AFTER_ERROR_MS = 15000;
const MAX_ERRORS = 5;

interface Response {
  tree?: VdfCategoryNode[];
  count?: number;
  export?: ExportSummary | null;
  exports?: ExportSummary[];
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

interface Selected {
  slug: string;
  name: string;
  count: number | null;
}

function TreeNode({
  node,
  path,
  selected,
  onToggle,
}: {
  node: VdfCategoryNode;
  path: string;
  selected: Map<string, Selected>;
  onToggle: (node: VdfCategoryNode, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const name = path ? `${path} → ${node.name}` : node.name;
  const checked = selected.has(node.slug);
  const count = selected.get(node.slug)?.count;
  return (
    <li>
      <div className="flex items-center gap-1.5 py-0.5">
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="w-5 text-brand-400 hover:text-brand-800"
            aria-label={open ? "Свернуть" : "Развернуть"}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-800">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle(node, name)}
            className="h-4 w-4 rounded border-brand-300 text-brand-700"
          />
          {node.name}
          {checked && (
            <span className="tnum text-xs text-brand-400">
              {count === null || count === undefined ? "считаем…" : `${count} товаров`}
            </span>
          )}
        </label>
      </div>
      {open && node.children.length > 0 && (
        <ul className="ml-5 border-l border-brand-100 pl-2">
          {node.children.map((child) => (
            <TreeNode key={child.slug} node={child} path={name} selected={selected} onToggle={onToggle} />
          ))}
        </ul>
      )}
    </li>
  );
}

function ExportRow({
  item,
  onChange,
}: {
  item: ExportSummary;
  onChange: (next: ExportSummary | null, removed?: boolean) => void;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const stopRef = useRef(false);

  const listing = item.sourcesPending > 0;
  const toRead = item.listed - item.read - item.errors;
  const done = !listing && toRead === 0;
  const total = Math.max(item.listed, item.expected);
  const percent = listing
    ? total ? (item.listed / total) * 100 : 0
    : item.listed ? ((item.read + item.errors) / item.listed) * 100 : 0;

  const run = async () => {
    stopRef.current = false;
    setRunning(true);
    setError("");
    let failures = 0;
    let current = item;
    while (!stopRef.current) {
      const phase = current.sourcesPending > 0 ? "list" : "read";
      if (phase === "read" && current.listed - current.read - current.errors === 0) break;
      try {
        const data = await call(phase, { id: item.id });
        if (!data.export) break;
        current = data.export;
        onChange(current);
        failures = 0;
      } catch (reason) {
        failures += 1;
        setError((reason as Error).message);
        if (failures >= MAX_ERRORS) break;
        await wait(PAUSE_AFTER_ERROR_MS);
      }
    }
    setRunning(false);
  };

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-brand-900">
            №{item.id} · {item.title}
          </p>
          <p className="tnum text-xs text-brand-500">
            {listing
              ? `Собираем список: ${item.listed} из ~${item.expected}`
              : `Прочитано карточек: ${item.read} из ${item.listed}`}
            {item.errors > 0 && ` · с ошибкой: ${item.errors}`}
            {running && item.next.length > 0 && ` · сейчас: ${item.next.join(", ")}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!done &&
            (running ? (
              <button type="button" onClick={() => (stopRef.current = true)} className="btn-secondary py-1.5 text-sm">
                <SpinnerIcon className="h-4 w-4 animate-spin" /> Остановить
              </button>
            ) : (
              <button type="button" onClick={run} className="btn-primary py-1.5 text-sm">
                {item.listed || item.read ? "Продолжить" : "Начать"}
              </button>
            ))}
          {item.read > 0 && (
            <a href={`/admin/api/vdf-catalog/xlsx/?export=${item.id}`} className="btn-secondary py-1.5 text-sm">
              Скачать таблицу ({item.read})
            </a>
          )}
          {item.errors > 0 && !running && (
            <button
              type="button"
              onClick={async () => onChange((await call("retry-export", { id: item.id })).export ?? null)}
              className="btn-ghost py-1.5 text-sm"
            >
              Повторить ошибки
            </button>
          )}
          {!running && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Удалить выгрузку №${item.id}? Скачанные файлы останутся у вас.`)) return;
                await call("delete-export", { id: item.id });
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
          className={`h-full rounded-full ${done ? "bg-green-600" : "bg-brand-700"}`}
          style={{ width: `${done ? 100 : Math.min(100, percent)}%` }}
        />
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-700">
          <AlertIcon className="h-3.5 w-3.5" /> {error}
        </p>
      )}
    </li>
  );
}

export function VdfCatalogExport({ loggedIn }: { loggedIn: boolean }) {
  const [tree, setTree] = useState<VdfCategoryNode[] | null>(null);
  const [treeError, setTreeError] = useState("");
  const [selected, setSelected] = useState<Map<string, Selected>>(new Map());
  const [exports, setExports] = useState<ExportSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    call("tree")
      .then((data) => setTree(data.tree ?? []))
      .catch((reason: Error) => setTreeError(reason.message));
    call("exports")
      .then((data) => setExports(data.exports ?? []))
      .catch(() => {});
  }, []);

  const toggle = (node: VdfCategoryNode, name: string) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(node.slug)) {
        next.delete(node.slug);
        return next;
      }
      next.set(node.slug, { slug: node.slug, name, count: null });
      call("count", { slug: node.slug })
        .then((data) =>
          setSelected((latest) => {
            const entry = latest.get(node.slug);
            if (!entry) return latest;
            const updated = new Map(latest);
            updated.set(node.slug, { ...entry, count: data.count ?? 0 });
            return updated;
          }),
        )
        .catch(() => {});
      return next;
    });
  };

  const chosen = [...selected.values()];
  const total = chosen.reduce((sum, item) => sum + (item.count ?? 0), 0);
  const minutes = Math.max(1, Math.ceil(total / 45));

  const start = async () => {
    setError("");
    if (
      !window.confirm(
        `Выгрузить ${total} товаров из ${chosen.length} раздел(ов)? Это займёт около ${minutes} мин. Вкладку нужно держать открытой, остановить и продолжить можно в любой момент.`,
      )
    ) {
      return;
    }
    try {
      const data = await call("create-export", {
        sources: chosen.map((item) => ({ slug: item.slug, name: item.name, count: item.count ?? 0 })),
      });
      if (data.export) setExports((current) => [data.export!, ...current]);
      setSelected(new Map());
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <h2 className="font-semibold text-brand-900">1. Выбрать разделы vdf-light.ru</h2>
        {!loggedIn && (
          <p className="text-sm text-amber-800">
            Нет входа в оптовый кабинет vdf-light.ru. Без него список товаров не собрать: сайт
            отдаёт его только вошедшим. Войдите в разделе «Курсы и цены».
          </p>
        )}
        {treeError && <p className="text-sm text-red-700">{treeError}</p>}
        {!tree && !treeError && (
          <p className="flex items-center gap-2 text-sm text-brand-500">
            <SpinnerIcon className="h-4 w-4 animate-spin" /> Загружаем разделы…
          </p>
        )}
        {tree && (
          <ul className="max-h-[28rem] overflow-y-auto rounded-xl border border-brand-100 p-2">
            {tree.map((node) => (
              <TreeNode key={node.slug} node={node} path="" selected={selected} onToggle={toggle} />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={start}
            disabled={!chosen.length || chosen.some((item) => item.count === null)}
            className="btn-primary py-2 text-sm"
          >
            Выгрузить выбранное{chosen.length ? ` (${total} товаров)` : ""}
          </button>
          {chosen.length > 0 && (
            <span className="text-xs text-brand-500">
              Примерно {minutes} мин. Раздел вместе с подразделами — отмечать подразделы отдельно
              не нужно, повторы не задвоятся.
            </span>
          )}
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>

      {exports.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-brand-900">2. Выгрузки</h2>
          <ul className="card divide-y divide-brand-100">
            {exports.map((item) => (
              <ExportRow
                key={item.id}
                item={item}
                onChange={(next, removed) =>
                  setExports((current) =>
                    removed
                      ? current.filter((entry) => entry.id !== item.id)
                      : current.map((entry) => (entry.id === item.id && next ? next : entry)),
                  )
                }
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
