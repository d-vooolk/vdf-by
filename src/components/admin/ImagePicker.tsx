"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

import { AlertIcon, CloseIcon, SpinnerIcon } from "@/components/icons";

/**
 * Выбор фотографий: загрузка новых и подбор уже загруженных.
 *
 * Компонент управляемый — хранит не файлы, а список путей вида
 * "lamps/osram/h7-1.jpg". Ровно они попадают в товар, и ровно по ним потом
 * ищется обработанная картинка.
 *
 * Используется в трёх местах: общая галерея товара, галерея значения опции
 * (тот самый цоколь H7 со своими фото) и картинка раздела. Поэтому умеет
 * работать и в режиме одной картинки (max = 1).
 */

export const UploadTrackerContext = createContext<
  ((delta: number) => void) | null
>(null);

export interface MediaItem {
  path: string;
  thumb: string;
  w: number;
  h: number;
  bytes: number;
  createdAt: number;
}

interface ImagePickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  /** Подпапка в public/img, куда лягут новые файлы: "lamps/osram". */
  folder?: string;
  /** Ограничение по количеству. 1 — режим одной картинки. */
  max?: number;
  label?: string;
  hint?: string;
  /**
   * Готовые адреса миниатюр для уже выбранных фото: путь -> ссылка.
   * Приходят со страницы, которая берёт их из манифеста.
   */
  thumbs?: Record<string, string>;
}

export function ImagePicker({
  value,
  onChange,
  folder = "",
  max = 20,
  label = "Фотографии",
  hint,
  thumbs,
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const trackUpload = useContext(UploadTrackerContext);

  useEffect(() => {
    if (!uploading || !trackUpload) return;
    trackUpload(1);
    return () => trackUpload(-1);
  }, [uploading, trackUpload]);

  /**
   * Адреса миниатюр накапливаются по ходу работы: часть пришла со страницы,
   * часть — из ответа на загрузку, часть — из окна выбора. Все три источника
   * знают точную ссылку, поэтому угадывать её по имени файла не нужно.
   */
  const [known, setKnown] = useState<Record<string, string>>(thumbs ?? {});
  const remember = (pairs: Record<string, string>) =>
    setKnown((current) => ({ ...current, ...pairs }));

  const full = value.length >= max;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setProblems([]);

    const form = new FormData();
    form.set("folder", folder);
    for (const file of Array.from(files).slice(0, max - value.length)) {
      form.append("files", file);
    }

    try {
      const response = await fetch("/admin/api/upload", {
        method: "POST",
        body: form,
      });
      const data = await response.json();

      if (!response.ok) {
        setProblems([data.error ?? `Сервер ответил ${response.status}`]);
        return;
      }

      const uploadedItems: Array<{ path: string; thumb: string }> =
        data.uploaded ?? [];

      remember(
        Object.fromEntries(uploadedItems.map((item) => [item.path, item.thumb])),
      );

      const added = uploadedItems.map((item) => item.path);
      if (added.length) onChange([...value, ...added].slice(0, max));
      if (data.problems?.length) setProblems(data.problems);
    } catch (error) {
      setProblems([(error as Error).message]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="label mb-0">{label}</span>
        <span className="tnum text-xs text-brand-300">
          {value.length}
          {max > 1 ? ` / ${max}` : ""}
        </span>
      </div>

      {hint && <p className="mb-2 text-xs text-brand-400">{hint}</p>}

      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {value.map((path, index) => (
            <li
              key={path}
              className="group relative h-20 w-20 overflow-hidden rounded-xl border border-brand-100"
            >
              <img
                src={known[path] ?? guessThumb(path)}
                alt={path}
                title={path}
                className="photo-bed h-full w-full object-contain"
              />

              {index === 0 && max > 1 && (
                <span className="absolute top-0 left-0 bg-brand-700 px-1 text-[10px] font-semibold text-white">
                  главное
                </span>
              )}

              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                title="Убрать"
                className="absolute top-0 right-0 bg-red-600/90 px-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                ×
              </button>

              {max > 1 && value.length > 1 && (
                <span className="absolute right-0 bottom-0 left-0 flex justify-between bg-brand-900/70 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => move(index, index - 1)}
                    disabled={index === 0}
                    title="Левее"
                    className="px-1.5 text-xs text-white disabled:opacity-30"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, index + 1)}
                    disabled={index === value.length - 1}
                    title="Правее"
                    className="px-1.5 text-xs text-white disabled:opacity-30"
                  >
                    →
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || full}
          className="btn-secondary py-2 text-sm"
        >
          {uploading ? (
            <>
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Обрабатываем…
            </>
          ) : (
            "Загрузить с компьютера"
          )}
        </button>

        <button
          type="button"
          onClick={() => setBrowsing(true)}
          disabled={full}
          className="btn-ghost py-2 text-sm"
        >
          Выбрать из загруженных
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple={max > 1}
          hidden
          onChange={(event) => upload(event.target.files)}
        />
      </div>

      {problems.length > 0 && (
        <ul className="mt-2 space-y-1">
          {problems.map((problem) => (
            <li key={problem} className="flex items-start gap-1.5 text-xs text-red-700">
              <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {problem}
            </li>
          ))}
        </ul>
      )}

      {browsing && (
        <MediaBrowser
          exclude={value}
          onClose={() => setBrowsing(false)}
          onPick={(picked) => {
            remember(
              Object.fromEntries(picked.map((item) => [item.path, item.thumb])),
            );
            onChange([...value, ...picked.map((item) => item.path)].slice(0, max));
            setBrowsing(false);
          }}
          limit={max - value.length}
        />
      )}
    </div>
  );
}

/**
 * Запасной вариант, когда точная ссылка на миниатюру неизвестна.
 *
 * Конвейер кладёт версии рядом с исходным именем и суффиксом ширины:
 * "lamps/osram/h7-1.jpg" -> "/img/lamps/osram/h7-1-400.webp". Догадка верна
 * для всех фото шириной от 400px, то есть практически для всех. Для узких
 * версии на 400 не существует, и вместо картинки будет пусто — поэтому
 * догадка и оставлена запасным вариантом, а не основным способом.
 */
function guessThumb(imagePath: string): string {
  const dot = imagePath.lastIndexOf(".");
  const base = dot > 0 ? imagePath.slice(0, dot) : imagePath;
  return `/img/${base}-400.webp`;
}

/* ------------------------------------------------------------------ */
/* Окно выбора                                                         */
/* ------------------------------------------------------------------ */

interface MediaBrowserProps {
  exclude: string[];
  limit: number;
  /** Отдаём и путь, и готовую ссылку на миниатюру — она уже загружена здесь. */
  onPick: (picked: Array<{ path: string; thumb: string }>) => void;
  onClose: () => void;
}

function MediaBrowser({ exclude, limit, onPick, onClose }: MediaBrowserProps) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/admin/api/media")
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setItems(data.images ?? []);
      })
      .catch((reason) => !cancelled && setError(String(reason)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Esc закрывает окно — привычка, которой стоит соответствовать.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const excluded = new Set(exclude);
  const visible = (items ?? []).filter(
    (item) =>
      !excluded.has(item.path) &&
      (!query || item.path.toLowerCase().includes(query.toLowerCase())),
  );

  const toggle = (path: string) =>
    setSelected((current) =>
      current.includes(path)
        ? current.filter((item) => item !== path)
        : current.length < limit
          ? [...current, path]
          : current,
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-card bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-brand-100 p-4">
          <h2 className="text-sm font-bold text-brand-900">Загруженные фото</h2>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по имени файла"
            className="field ml-auto max-w-56 py-1.5 text-sm"
          />
          <button type="button" onClick={onClose} className="btn-ghost px-2 py-1.5">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto p-4">
          {error && <p className="text-sm text-red-700">{error}</p>}

          {!items && !error && (
            <p className="flex items-center gap-2 text-sm text-brand-400">
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Загружаем список…
            </p>
          )}

          {items && visible.length === 0 && (
            <p className="py-8 text-center text-sm text-brand-400">
              {items.length === 0
                ? "Загруженных фотографий пока нет."
                : "Ничего не нашлось."}
            </p>
          )}

          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {visible.map((item) => {
              const active = selected.includes(item.path);
              return (
                <li key={item.path}>
                  <button
                    type="button"
                    onClick={() => toggle(item.path)}
                    title={item.path}
                    className={`block w-full overflow-hidden rounded-xl border-2 transition-colors ${
                      active ? "border-brand-600" : "border-transparent hover:border-brand-200"
                    }`}
                  >
                    <img
                      src={item.thumb}
                      alt={item.path}
                      className="photo-bed aspect-square w-full object-contain"
                    />
                    <span className="block truncate px-1 py-1 text-[10px] text-brand-400">
                      {item.path}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-brand-100 p-4">
          <p className="text-xs text-brand-400">
            Выбрано {selected.length} из возможных {limit}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost py-2 text-sm">
              Отмена
            </button>
            <button
              type="button"
              onClick={() =>
                onPick(
                  selected.map((path) => ({
                    path,
                    thumb:
                      (items ?? []).find((item) => item.path === path)?.thumb ??
                      "",
                  })),
                )
              }
              disabled={!selected.length}
              className="btn-primary py-2 text-sm"
            >
              Добавить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
