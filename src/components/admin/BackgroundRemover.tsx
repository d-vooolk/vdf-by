"use client";

import { useEffect, useState } from "react";

import { AlertIcon, CloseIcon, SpinnerIcon } from "@/components/icons";

export interface CutoutImage {
  path: string;
  thumb: string;
}

interface BackgroundRemoverProps {
  imagePath: string;
  thumb: string;
  folder: string;
  canAdd: boolean;
  onReplace: (image: CutoutImage) => void;
  onAdd: (image: CutoutImage) => void;
  onSavingChange?: (saving: boolean) => void;
  onClose: () => void;
}

interface UploadReply {
  error?: string;
  uploaded?: CutoutImage[];
  problems?: string[];
}

async function readError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `Ошибка ${response.status}`;
}

async function cutBackground(imagePath: string): Promise<Blob> {
  const source = await fetch(`/admin/api/composer/image/?path=${encodeURIComponent(imagePath)}`);
  if (!source.ok) throw new Error("Не удалось загрузить фото");
  const form = new FormData();
  form.set("image", await source.blob(), "product.webp");
  const response = await fetch("/admin/api/composer/cutout/", { method: "POST", body: form });
  if (!response.ok) throw new Error(await readError(response));
  return response.blob();
}

async function onWhite(cutout: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(cutout);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Браузер не умеет рисовать картинки");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Не удалось собрать картинку"))), "image/png"),
  );
}

function cutoutFilename(imagePath: string): string {
  const name = imagePath.split("/").pop() ?? "photo";
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}-bez-fona.png`;
}

async function upload(image: Blob, folder: string, filename: string): Promise<CutoutImage> {
  const form = new FormData();
  form.set("folder", folder);
  form.append("files", image, filename);
  const response = await fetch("/admin/api/upload/", { method: "POST", body: form });
  const data = (await response.json().catch(() => ({}))) as UploadReply;
  const stored = data.uploaded?.[0];
  if (!response.ok || !stored) {
    throw new Error(data.error ?? data.problems?.[0] ?? `Ошибка ${response.status}`);
  }
  return { path: stored.path, thumb: stored.thumb };
}

export function BackgroundRemover({
  imagePath,
  thumb,
  folder,
  canAdd,
  onReplace,
  onAdd,
  onSavingChange,
  onClose,
}: BackgroundRemoverProps) {
  const [cutout, setCutout] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    cutBackground(imagePath)
      .then((result) => {
        if (cancelled) return;
        setCutout(result);
        setPreview(URL.createObjectURL(result));
      })
      .catch((problem) => !cancelled && setError((problem as Error).message));
    return () => {
      cancelled = true;
    };
  }, [imagePath]);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (!saving) return;
    onSavingChange?.(true);
    return () => onSavingChange?.(false);
  }, [saving, onSavingChange]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const save = async (apply: (image: CutoutImage) => void) => {
    if (!cutout) return;
    setSaving(true);
    setError("");
    try {
      apply(await upload(await onWhite(cutout), folder, cutoutFilename(imagePath)));
      onClose();
    } catch (problem) {
      setError((problem as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-card bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-brand-100 p-4">
          <h2 className="text-sm font-bold text-brand-900">Убрать фон</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn-ghost ml-auto px-2 py-1.5"
            aria-label="Закрыть"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto p-4 sm:grid-cols-2">
          <figure>
            <figcaption className="mb-1.5 text-xs text-brand-400">Было</figcaption>
            <img
              src={thumb}
              alt={imagePath}
              className="photo-bed aspect-square w-full rounded-xl border border-brand-100 object-contain"
            />
          </figure>
          <figure>
            <figcaption className="mb-1.5 text-xs text-brand-400">Стало</figcaption>
            <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-brand-100 bg-white">
              {preview ? (
                <img src={preview} alt="Без фона" className="h-full w-full object-contain" />
              ) : error ? (
                <span className="px-4 text-center text-sm text-brand-400">Нет результата</span>
              ) : (
                <span className="flex items-center gap-2 text-sm text-brand-400">
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                  Убираем фон нейросетью…
                </span>
              )}
            </div>
          </figure>
        </div>

        {error && (
          <p className="flex items-start gap-1.5 px-4 text-sm text-red-700">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-100 p-4">
          <p className="text-xs text-brand-400">
            Фон станет белым. Сохраняется новым файлом, исходное фото остаётся в «Фото».
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="btn-ghost py-2 text-sm">
              Отмена
            </button>
            {canAdd && (
              <button
                type="button"
                onClick={() => save(onAdd)}
                disabled={!cutout || saving}
                className="btn-secondary py-2 text-sm"
              >
                Добавить рядом
              </button>
            )}
            <button
              type="button"
              onClick={() => save(onReplace)}
              disabled={!cutout || saving}
              className="btn-primary py-2 text-sm"
            >
              {saving && <SpinnerIcon className="h-4 w-4 animate-spin" />}
              Заменить фото
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
