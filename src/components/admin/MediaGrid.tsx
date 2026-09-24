"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { deleteImageAction } from "@/app/admin/actions";
import { Problems } from "@/components/admin/form-parts";
import { SpinnerIcon, TrashIcon } from "@/components/icons";
import type { MediaItem } from "@/components/admin/ImagePicker";

/**
 * Сетка загруженных фотографий с поиском, загрузкой и удалением.
 *
 * Удаление проходит через сервер, который сначала проверяет, не стоит ли фото
 * в каком-нибудь товаре или разделе. Проверять это здесь бессмысленно: список
 * товаров тут неизвестен, а решать такое на клиенте всё равно нельзя.
 */

export function MediaGrid({ items: initial }: { items: MediaItem[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const [uploading, setUploading] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");

  const visible = initial.filter(
    (item) => !query || item.path.toLowerCase().includes(query.toLowerCase()),
  );

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setProblems([]);

    const form = new FormData();
    form.set("folder", folder);
    for (const file of Array.from(files)) form.append("files", file);

    try {
      const response = await fetch("/admin/api/upload/", {
        method: "POST",
        body: form,
      });
      const data = await response.json();

      if (!response.ok) setProblems([data.error ?? `Ошибка ${response.status}`]);
      else if (data.problems?.length) setProblems(data.problems);

      router.refresh();
    } catch (error) {
      setProblems([(error as Error).message]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const remove = (path: string) => {
    setProblems([]);
    startTransition(async () => {
      const result = await deleteImageAction(path);
      if (!result.ok) setProblems(result.problems);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-0 flex-1">
          <span className="label">Поиск</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Часть пути или имени файла"
            className="field py-2 text-sm"
          />
        </label>

        <label className="min-w-0 flex-1">
          <span className="label">Папка для новых</span>
          <input
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            placeholder="lamps/osram"
            className="field py-2 text-sm"
          />
        </label>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="btn-primary py-2 text-sm"
        >
          {uploading ? (
            <>
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Обрабатываем…
            </>
          ) : (
            "Загрузить фото"
          )}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          hidden
          onChange={(event) => upload(event.target.files)}
        />
      </div>

      <Problems items={problems} />

      {visible.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          {initial.length === 0
            ? "Фотографий пока нет. Загрузите их здесь или прямо в карточке товара."
            : "Ничего не нашлось."}
        </p>
      ) : (
        <ul
          className={`grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 ${
            pending ? "opacity-60" : ""
          }`}
        >
          {visible.map((item) => (
            <li key={item.path} className="card overflow-hidden">
              <img
                src={item.thumb}
                alt={item.path}
                loading="lazy"
                className="photo-bed aspect-square w-full object-contain"
              />
              <div className="p-2">
                <p
                  className="truncate text-xs font-medium text-brand-600"
                  title={item.path}
                >
                  {item.path}
                </p>
                <p className="tnum mt-0.5 text-[11px] text-brand-300">
                  {item.w}×{item.h} · {(item.bytes / 1024).toFixed(0)} КБ
                </p>
                <button
                  type="button"
                  onClick={() => remove(item.path)}
                  disabled={pending}
                  className="btn-ghost mt-1 w-full px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
