"use client";

import { useRef, useState } from "react";

import { SpinnerIcon } from "@/components/icons";

import { RegionSelector, type Region } from "./RegionSelector";

export type CarPhotoOrigin = "catalog" | "wikimedia" | "upload";

export interface CarPhotoInfo {
  thumb: string | null;
  origin: CarPhotoOrigin;
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

interface SavedPhoto {
  photo: CarPhotoInfo | null;
  plates?: number | null;
  warning?: string;
}

const KIND_STYLE: Record<Candidate["licenseKind"], string> = {
  free: "bg-emerald-100 text-emerald-800",
  by: "bg-sky-100 text-sky-800",
  "by-sa": "bg-amber-100 text-amber-900",
};

const ORIGIN_LABEL: Record<CarPhotoOrigin, string> = {
  catalog: "Фото из справочника автомобилей",
  wikimedia: "Фото с Wikimedia Commons",
  upload: "Своё фото",
};

function plateNotice(plates: number | null | undefined): string {
  if (plates === null || plates === undefined) return "";
  if (plates === 0) return "Номеров не нашлось. Если номер виден, выделите его мышкой и размойте.";
  return plates === 1 ? "Номер размыт автоматически." : `Размыто номеров: ${plates}.`;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Ошибка ${response.status}`);
  return data;
}

interface ComposerCarPhotoProps {
  generationId: string;
  initialQuery: string;
  photo: CarPhotoInfo | null;
  plates: number | null;
  hasCatalogPhoto: boolean;
  onChange: (photo: CarPhotoInfo | null) => void;
}

export function ComposerCarPhoto({
  generationId,
  initialQuery,
  photo,
  plates,
  hasCatalogPhoto,
  onChange,
}: ComposerCarPhotoProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(plateNotice(plates));
  const [region, setRegion] = useState<Region | null>(null);

  const apply = (saved: SavedPhoto, message = plateNotice(saved.plates)) => {
    onChange(saved.photo);
    setNotice(saved.warning || message);
    setRegion(null);
    setCandidates(null);
  };

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy("");
    }
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    void run("upload", async () => {
      const form = new FormData();
      form.set("generationId", generationId);
      form.set("file", file);
      apply(await readJson<SavedPhoto>(await fetch("/admin/api/composer/car/", { method: "POST", body: form })));
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const resetToCatalog = () =>
    run("reset", async () => {
      apply(
        await readJson<SavedPhoto>(
          await fetch(`/admin/api/composer/car/?generation=${encodeURIComponent(generationId)}`, {
            method: "DELETE",
          }),
        ),
      );
    });

  const blurRegion = () =>
    run("blur", async () => {
      if (!region) return;
      const saved = await readJson<SavedPhoto>(
        await fetch("/admin/api/composer/blur/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generationId, region }),
        }),
      );
      apply(saved, "Выделенная область размыта.");
    });

  const search = () =>
    run("search", async () => {
      const params = new URLSearchParams({ generation: generationId });
      if (query.trim()) params.set("q", query.trim());
      const data = await readJson<{ candidates: Candidate[] }>(
        await fetch(`/admin/api/composer/wikimedia/?${params}`),
      );
      setCandidates(data.candidates);
    });

  const pick = (candidate: Candidate) =>
    run(candidate.title, async () => {
      apply(
        await readJson<SavedPhoto>(
          await fetch("/admin/api/composer/car/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ generationId, title: candidate.title }),
          }),
        ),
      );
    });

  return (
    <div className="space-y-4">
      {photo?.thumb ? (
        <div className="space-y-2">
          <RegionSelector src={photo.thumb} value={region} onChange={setRegion} className="max-w-xl" />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium text-brand-900">{ORIGIN_LABEL[photo.origin]}</span>
            {photo.origin === "wikimedia" && (
              <span className="text-brand-500">
                {photo.author && <>автор: {photo.author}, </>}
                {photo.license}
                {photo.sourceUrl && (
                  <>
                    {" "}
                    ·{" "}
                    <a href={photo.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                      источник
                    </a>
                  </>
                )}
              </span>
            )}
          </div>
          {notice && <p className="text-sm text-brand-600">{notice}</p>}
          <p className="text-xs text-brand-400">Номер или другое лишнее можно выделить мышкой на фото и размыть.</p>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-brand-200 p-6 text-center text-sm text-brand-500">
          В справочнике нет фото этого поколения. Загрузите своё или подберите на Wikimedia.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary py-2 text-sm"
          onClick={() => fileRef.current?.click()}
          disabled={Boolean(busy)}
        >
          {busy === "upload" && <SpinnerIcon className="h-4 w-4 animate-spin" />}
          Загрузить своё фото
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          hidden
          onChange={(event) => upload(event.target.files?.[0])}
        />
        {photo && (
          <button
            type="button"
            className="btn-secondary py-2 text-sm"
            onClick={blurRegion}
            disabled={!region || Boolean(busy)}
          >
            {busy === "blur" && <SpinnerIcon className="h-4 w-4 animate-spin" />}
            Размыть выделенное
          </button>
        )}
        {photo && photo.origin !== "catalog" && hasCatalogPhoto && (
          <button type="button" className="btn-ghost py-2 text-sm" onClick={resetToCatalog} disabled={Boolean(busy)}>
            {busy === "reset" && <SpinnerIcon className="h-4 w-4 animate-spin" />}
            Вернуть фото из справочника
          </button>
        )}
      </div>

      <details className="text-sm" open={!photo}>
        <summary className="cursor-pointer font-medium text-brand-700">Подобрать фото на Wikimedia Commons</summary>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void search();
                }
              }}
              placeholder="Например: BMW 5 Series G30 front"
              className="field min-w-64 flex-1 py-2 text-sm"
            />
            <button type="button" className="btn-secondary py-2 text-sm" onClick={search} disabled={Boolean(busy)}>
              {busy === "search" && <SpinnerIcon className="h-4 w-4 animate-spin" />}
              Найти
            </button>
          </div>
          <p className="text-xs text-brand-500">
            Только свободные лицензии: CC0 и PD без условий, CC BY и CC BY-SA с указанием автора. Авторы
            попадают на страницу «Источники фотографий».
          </p>
          {candidates && candidates.length === 0 && (
            <p className="text-brand-500">Ничего не нашлось. Попробуйте код кузова, год или английское название.</p>
          )}
          {candidates && candidates.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {candidates.map((candidate) => (
                <li key={candidate.title}>
                  <button
                    type="button"
                    onClick={() => pick(candidate)}
                    disabled={Boolean(busy)}
                    className="block w-full overflow-hidden rounded-lg border border-brand-100 bg-white text-left hover:border-brand-400 disabled:opacity-60"
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
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
