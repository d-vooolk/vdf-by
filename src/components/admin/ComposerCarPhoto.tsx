"use client";

import { useEffect, useRef, useState } from "react";

import { SpinnerIcon } from "@/components/icons";

import { RegionSelector, type Region } from "./RegionSelector";

export interface CarPhotoInfo {
  thumb: string | null;
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
}

interface Candidate {
  title: string;
  thumb: string;
  width: number;
  height: number;
  author: string;
  license: string;
  licenseKind: "free" | "by" | "by-sa";
  sourceUrl: string;
}

const KIND_STYLE: Record<Candidate["licenseKind"], string> = {
  free: "bg-emerald-100 text-emerald-800",
  by: "bg-sky-100 text-sky-800",
  "by-sa": "bg-amber-100 text-amber-900",
};

interface SavedPhoto {
  photo: CarPhotoInfo;
  plates?: number;
  warning?: string;
}

function plateNotice(saved: SavedPhoto, blur: boolean): string {
  if (saved.warning) return saved.warning;
  if (!blur) return "";
  if (!saved.plates) return "Номеров на фото не нашлось. Если номер всё же виден, выделите его мышкой и нажмите «Размыть выделенное».";
  return saved.plates === 1 ? "Номер размыт автоматически." : `Размыто номеров: ${saved.plates}.`;
}

interface ComposerCarPhotoProps {
  generationId: string;
  initialQuery: string;
  photo: CarPhotoInfo | null;
  onChange: (photo: CarPhotoInfo | null) => void;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Ошибка ${response.status}`);
  return data;
}

export function ComposerCarPhoto({ generationId, initialQuery, photo, onChange }: ComposerCarPhotoProps) {
  const [open, setOpen] = useState(!photo);
  const [query, setQuery] = useState(initialQuery);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [author, setAuthor] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [blur, setBlur] = useState(true);
  const [notice, setNotice] = useState("");
  const [region, setRegion] = useState<Region | null>(null);

  const search = async (custom: boolean) => {
    setBusy("search");
    setError("");
    try {
      const params = new URLSearchParams({ generation: generationId });
      if (custom && query.trim()) params.set("q", query.trim());
      const data = await readJson<{ query: string; candidates: Candidate[] }>(
        await fetch(`/admin/api/composer/wikimedia/?${params}`),
      );
      setCandidates(data.candidates);
      if (!custom) setQuery(data.query);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy("");
    }
  };

  const searched = useRef(false);
  useEffect(() => {
    if (photo || searched.current) return;
    const timer = setTimeout(() => {
      searched.current = true;
      void search(false);
    }, 0);
    return () => clearTimeout(timer);
  });

  const finish = (saved: SavedPhoto) => {
    onChange(saved.photo);
    setNotice(plateNotice(saved, blur));
    setRegion(null);
    setOpen(false);
    setCandidates(null);
  };

  const pick = async (candidate: Candidate) => {
    setBusy(candidate.title);
    setError("");
    try {
      const data = await readJson<SavedPhoto>(
        await fetch("/admin/api/composer/car/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generationId, title: candidate.title, blur }),
        }),
      );
      finish(data);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy("");
    }
  };

  const upload = async () => {
    if (!file) return;
    setBusy("upload");
    setError("");
    try {
      const form = new FormData();
      form.set("generationId", generationId);
      form.set("file", file);
      form.set("author", author);
      form.set("sourceUrl", sourceUrl);
      form.set("blur", blur ? "1" : "0");
      const data = await readJson<SavedPhoto>(
        await fetch("/admin/api/composer/car/", { method: "POST", body: form }),
      );
      setFile(null);
      finish(data);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy("");
    }
  };

  const blurRegion = async () => {
    if (!region) return;
    setBusy("blur");
    setError("");
    try {
      const data = await readJson<SavedPhoto>(
        await fetch("/admin/api/composer/blur/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generationId, region }),
        }),
      );
      onChange(data.photo);
      setRegion(null);
      setNotice("Выделенная область размыта.");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    setBusy("remove");
    setError("");
    try {
      await readJson(
        await fetch(`/admin/api/composer/car/?generation=${encodeURIComponent(generationId)}`, {
          method: "DELETE",
        }),
      );
      onChange(null);
      setOpen(true);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-4">
      {photo && (
        <div className="flex flex-wrap items-start gap-4">
          {photo.thumb && (
            <div className="w-full max-w-sm space-y-2">
              <RegionSelector src={photo.thumb} value={region} onChange={setRegion} />
              <button
                type="button"
                className="btn-secondary py-1.5"
                onClick={blurRegion}
                disabled={!region || Boolean(busy)}
              >
                {busy === "blur" && <SpinnerIcon className="h-4 w-4 animate-spin" />}
                Размыть выделенное
              </button>
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <p className="font-medium text-brand-900">Фото автомобиля выбрано</p>
            {notice && <p className="text-brand-600">{notice}</p>}
            <p className="text-xs text-brand-400">
              Номер или другое лишнее можно выделить мышкой на фото и размыть.
            </p>
            {photo.author && <p className="text-brand-500">Автор: {photo.author}</p>}
            {photo.license && <p className="text-brand-500">Лицензия: {photo.license}</p>}
            {photo.sourceUrl && (
              <a href={photo.sourceUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                Страница источника
              </a>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className="btn-secondary py-1.5" onClick={() => setOpen((value) => !value)}>
                {open ? "Свернуть" : "Заменить"}
              </button>
              <button
                type="button"
                className="btn-ghost py-1.5 text-red-700"
                onClick={remove}
                disabled={Boolean(busy)}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-4 rounded-xl border border-brand-100 bg-brand-50/50 p-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-64 flex-1 text-sm">
              <span className="label">Поиск на Wikimedia Commons</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void search(true);
                  }
                }}
                placeholder="Например: BMW 5 Series G30 front"
                className="field py-2 text-sm"
              />
            </label>
            <button type="button" className="btn-primary" onClick={() => search(query.trim() !== initialQuery)} disabled={Boolean(busy)}>
              {busy === "search" && <SpinnerIcon className="h-4 w-4 animate-spin" />}
              Найти
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-brand-800">
            <input type="checkbox" checked={blur} onChange={(event) => setBlur(event.target.checked)} />
            Автоматически размывать номерные знаки
          </label>

          <p className="text-xs text-brand-500">
            Показываются только фото, которые можно использовать в магазине: <b>CC0 / PD</b> — без условий,{" "}
            <b>CC BY</b> — с указанием автора, <b>CC BY-SA</b> — с указанием автора и той же лицензией на
            производное изображение. Авторы автоматически попадают на страницу «Источники фотографий».
          </p>

          {candidates && candidates.length === 0 && (
            <p className="text-sm text-brand-500">
              Ничего подходящего. Попробуйте другой запрос: код кузова, «facelift», год или английское название модели.
            </p>
          )}

          {candidates && candidates.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {candidates.map((candidate) => (
                <li key={candidate.title}>
                  <button
                    type="button"
                    onClick={() => pick(candidate)}
                    disabled={Boolean(busy)}
                    className="group block w-full overflow-hidden rounded-lg border border-brand-100 bg-white text-left hover:border-brand-400 disabled:opacity-60"
                  >
                    <span className="relative block aspect-[3/2] bg-brand-100">
                      <img src={candidate.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {busy === candidate.title && (
                        <span className="absolute inset-0 flex items-center justify-center bg-white/70">
                          <SpinnerIcon className="h-6 w-6 animate-spin" />
                        </span>
                      )}
                    </span>
                    <span className="block space-y-1 p-2 text-xs">
                      <span className={`badge px-2 py-0.5 ${KIND_STYLE[candidate.licenseKind]}`}>{candidate.license}</span>
                      <span className="block truncate text-brand-700" title={candidate.title}>
                        {candidate.title.replace(/^File:/, "")}
                      </span>
                      <span className="block text-brand-400">
                        {candidate.width}×{candidate.height}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-brand-700">Загрузить своё фото автомобиля</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="label">Файл</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="block w-full text-sm"
                />
              </label>
              <label className="block">
                <span className="label">Автор (если фото не ваше)</span>
                <input value={author} onChange={(event) => setAuthor(event.target.value)} className="field py-2 text-sm" />
              </label>
              <label className="block">
                <span className="label">Ссылка на источник</span>
                <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} className="field py-2 text-sm" />
              </label>
            </div>
            <button type="button" className="btn-secondary mt-3" onClick={upload} disabled={!file || Boolean(busy)}>
              {busy === "upload" && <SpinnerIcon className="h-4 w-4 animate-spin" />}
              Загрузить
            </button>
          </details>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
