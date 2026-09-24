"use client";

import { useState, useSyncExternalStore } from "react";

import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons";
import type { FaqItem } from "@/lib/schema";

type Stage = "fetch" | "extract" | "rewrite" | "faq" | "photos";

const PHOTOS_PREFERENCE = "vdf-admin-import-photos";
const PREFERENCE_EVENT = "vdf-admin-preference";

function subscribePreference(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PREFERENCE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PREFERENCE_EVENT, onChange);
  };
}

const readPhotosPreference = () => window.localStorage.getItem(PHOTOS_PREFERENCE) === "1";

function stagesFor(withPhotos: boolean, fromTitle: boolean): Array<{ key: Stage; label: string }> {
  return [
    { key: "fetch", label: "Открываем страницу" },
    { key: "extract", label: "Находим описание и характеристики" },
    {
      key: "rewrite",
      label: fromTitle ? "Пишем описание по названию — на странице его нет" : "Переписываем описание",
    },
    { key: "faq", label: "Составляем вопросы-ответы" },
    ...(withPhotos ? [{ key: "photos" as const, label: "Загружаем фото" }] : []),
  ];
}

interface ImportEvent {
  stage?: Stage;
  title?: string;
  specs?: Array<{ name: string; value: string }>;
  text?: string;
  description?: string;
  faq?: FaqItem[];
  fromTitle?: boolean;
  images?: Array<{ path: string; thumb: string }>;
  photoWarning?: string;
  warning?: string;
  error?: string;
  done?: boolean;
}

export interface ImportTarget<Snapshot> {
  context: {
    categoryName?: string;
    brand?: string;
    options: string[];
    faq: FaqItem[];
  };
  folder: string;
  snapshot: () => Snapshot;
  restore: (snapshot: Snapshot) => void;
  onTitle: (title: string) => void;
  onSpecs: (specs: Array<{ name: string; value: string }>) => void;
  onDescription: (description: string) => void;
  onFaq: (items: FaqItem[]) => void;
  onImages: (images: Array<{ path: string; thumb: string }>) => void;
}

export function ImportFromUrl<Snapshot>({
  ready,
  target,
}: {
  ready: boolean;
  target: ImportTarget<Snapshot>;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [backup, setBackup] = useState<Snapshot | null>(null);
  const withPhotos = useSyncExternalStore(subscribePreference, readPhotosPreference, () => false);
  const [photosRequested, setPhotosRequested] = useState(false);
  const [fromTitle, setFromTitle] = useState(false);
  const [photoWarning, setPhotoWarning] = useState("");

  const togglePhotos = () => {
    window.localStorage.setItem(PHOTOS_PREFERENCE, withPhotos ? "0" : "1");
    window.dispatchEvent(new Event(PREFERENCE_EVENT));
  };

  const run = async () => {
    const before = target.snapshot();
    setBusy(true);
    setFinished(false);
    setError("");
    setWarning("");
    setPhotoWarning("");
    setFromTitle(false);
    setPhotosRequested(withPhotos);
    setStage(null);
    setBackup(before);

    let draft = "";
    let completed = false;
    try {
      const response = await fetch("/admin/api/ai/import/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          ...target.context,
          photos: withPhotos,
          folder: target.folder,
        }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Сервер ответил ${response.status}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ImportEvent;
          if (event.stage) setStage(event.stage);
          if (event.fromTitle) setFromTitle(true);
          if (event.images) target.onImages(event.images);
          if (event.photoWarning) setPhotoWarning(event.photoWarning);
          if (event.title) target.onTitle(event.title);
          if (event.specs) target.onSpecs(event.specs);
          if (event.text) {
            draft += event.text;
            target.onDescription(draft);
          }
          if (event.description !== undefined) target.onDescription(event.description);
          if (event.faq) target.onFaq(event.faq);
          if (event.warning) setWarning(event.warning);
          if (event.error) setError(event.error);
          if (event.done) completed = true;
        }
      }
      if (completed) setFinished(true);
      else setError((current) => current || "Генерация оборвалась — попробуйте ещё раз");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stages = stagesFor(photosRequested, fromTitle);

  const reached = (key: Stage) => {
    if (finished) return "done";
    const current = stages.findIndex((item) => item.key === stage);
    const index = stages.findIndex((item) => item.key === key);
    if (current < 0 || index > current) return "waiting";
    if (index < current) return "done";
    return error ? "failed" : "active";
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && url.trim() && !busy && ready) {
              event.preventDefault();
              void run();
            }
          }}
          placeholder="https://vdf-light.ru/product/G28-BIG-24R"
          className="field flex-1"
          disabled={busy}
        />
        <button
          type="button"
          onClick={run}
          disabled={busy || !ready || !url.trim()}
          className="btn-secondary shrink-0 py-2 text-sm"
        >
          {busy ? (
            <>
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Генерируем…
            </>
          ) : (
            "Сгенерировать по ссылке"
          )}
        </button>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={withPhotos}
        onClick={togglePhotos}
        disabled={busy}
        className="flex items-center gap-2.5 text-sm text-brand-800 disabled:opacity-60"
      >
        <span
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
            withPhotos ? "bg-brand-700" : "bg-brand-200"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
              withPhotos ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </span>
        Выгружать фото
        <span className="text-xs text-brand-400">— скачать фото товара со страницы и добавить к нам</span>
      </button>

      {!ready && (
        <p className="text-xs text-brand-400">
          Заработает, когда в .env на сервере появится AI_API_KEY.
        </p>
      )}

      {(busy || stage) && (
        <ol className="space-y-1 text-sm">
          {stages.map((item) => {
            const state = reached(item.key);
            return (
              <li
                key={item.key}
                className={`flex items-center gap-2 ${
                  state === "waiting"
                    ? "text-brand-300"
                    : state === "failed"
                      ? "text-red-700"
                      : state === "done"
                        ? "text-green-700"
                        : "text-brand-900"
                }`}
              >
                {state === "active" && busy ? (
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                ) : state === "done" ? (
                  <CheckIcon className="h-4 w-4" />
                ) : state === "failed" ? (
                  <AlertIcon className="h-4 w-4" />
                ) : (
                  <span className="inline-block h-4 w-4" />
                )}
                {item.label}
              </li>
            );
          })}
        </ol>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-red-700" role="alert">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {photoWarning && (
        <p className="flex items-start gap-1.5 text-sm text-amber-700">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {photoWarning}
        </p>
      )}
      {warning && !error && (
        <p className="flex items-start gap-1.5 text-sm text-amber-700">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {warning}
        </p>
      )}

      {backup !== null && !busy && (stage || error) && (
        <button
          type="button"
          onClick={() => {
            target.restore(backup);
            setBackup(null);
            setStage(null);
            setFinished(false);
            setError("");
            setWarning("");
            setPhotoWarning("");
          }}
          className="btn-ghost py-1.5 text-sm"
        >
          Вернуть как было
        </button>
      )}
    </div>
  );
}
