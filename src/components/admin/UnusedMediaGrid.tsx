"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteUnusedImagesAction } from "@/app/admin/actions";
import { Problems } from "@/components/admin/form-parts";
import type { MediaItem } from "@/components/admin/ImagePicker";
import { CheckIcon, SpinnerIcon, TrashIcon } from "@/components/icons";

const BATCH = 200;

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export function UnusedMediaGrid({ items: initial }: { items: MediaItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const selectedBytes = items
    .filter((item) => selected.has(item.path))
    .reduce((sum, item) => sum + item.bytes, 0);
  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0);

  const toggle = (path: string) => {
    setConfirming(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = () => {
    setConfirming(false);
    setSelected(new Set(items.map((item) => item.path)));
  };

  const clear = () => {
    setConfirming(false);
    setSelected(new Set());
  };

  const remove = async () => {
    const paths = [...selected];
    setConfirming(false);
    setProblems([]);
    setProgress({ done: 0, total: paths.length });
    const removed = new Set<string>();
    const notes: string[] = [];
    try {
      for (let start = 0; start < paths.length; start += BATCH) {
        const result = await deleteUnusedImagesAction(paths.slice(start, start + BATCH));
        for (const path of result.deleted) removed.add(path);
        notes.push(...result.problems);
        setProgress({ done: Math.min(start + BATCH, paths.length), total: paths.length });
      }
    } catch (error) {
      notes.push((error as Error).message);
    } finally {
      setItems((current) => current.filter((item) => !removed.has(item.path)));
      setSelected(new Set());
      setProblems(notes);
      setProgress(null);
      router.refresh();
    }
  };

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <Problems items={problems} />
        <p className="card p-10 text-center text-sm text-brand-400">
          Неиспользуемых фото нет — все загруженные где-то стоят.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card sticky top-14 z-10 flex flex-wrap items-center gap-3 p-4 lg:top-0">
        <p className="text-sm text-brand-600">
          {selected.size > 0 ? (
            <>
              Выбрано <b className="tnum">{selected.size}</b> из{" "}
              <span className="tnum">{items.length}</span> · {megabytes(selectedBytes)}
            </>
          ) : (
            <>
              Всего <span className="tnum">{items.length}</span> · {megabytes(totalBytes)} на диске
            </>
          )}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary py-2 text-sm"
            onClick={selectAll}
            disabled={progress !== null}
          >
            Выделить все
          </button>
          {selected.size > 0 && progress === null && (
            <button type="button" className="btn-ghost py-2 text-sm" onClick={clear}>
              Снять выделение
            </button>
          )}
          {progress !== null ? (
            <span className="btn-secondary py-2 text-sm">
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Удаляем {progress.done} из {progress.total}…
            </span>
          ) : confirming ? (
            <>
              <button
                type="button"
                className="btn bg-red-600 py-2 text-sm text-white hover:bg-red-700"
                onClick={remove}
              >
                Да, удалить {selected.size} фото
              </button>
              <button
                type="button"
                className="btn-ghost py-2 text-sm"
                onClick={() => setConfirming(false)}
              >
                Отмена
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-secondary py-2 text-sm text-red-700"
              onClick={() => setConfirming(true)}
              disabled={selected.size === 0}
            >
              <TrashIcon className="h-4 w-4" />
              Удалить выбранные
            </button>
          )}
        </div>
      </div>

      <Problems items={problems} />

      <ul
        className={`grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 ${
          progress !== null ? "opacity-60" : ""
        }`}
      >
        {items.map((item) => {
          const active = selected.has(item.path);
          return (
            <li key={item.path}>
              <button
                type="button"
                onClick={() => toggle(item.path)}
                disabled={progress !== null}
                aria-pressed={active}
                className={`card relative block w-full overflow-hidden text-left transition ${
                  active ? "ring-2 ring-brand-700" : "hover:border-brand-300"
                }`}
              >
                <img
                  src={item.thumb}
                  alt={item.path}
                  loading="lazy"
                  className="photo-bed aspect-square w-full object-contain"
                />
                <span
                  className={`absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-md border-2 ${
                    active
                      ? "border-brand-700 bg-brand-700 text-white"
                      : "border-brand-300 bg-white/90"
                  }`}
                >
                  {active && <CheckIcon className="h-4 w-4" />}
                </span>
                <span className="block p-2">
                  <span
                    className="block truncate text-xs font-medium text-brand-600"
                    title={item.path}
                  >
                    {item.path}
                  </span>
                  <span className="tnum mt-0.5 block text-[11px] text-brand-300">
                    {item.w}×{item.h} · {(item.bytes / 1024).toFixed(0)} КБ
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
