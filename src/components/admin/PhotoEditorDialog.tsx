"use client";

import { useEffect, useState } from "react";

import { AlertIcon, CloseIcon, SpinnerIcon } from "@/components/icons";
import { useBackdropClose } from "@/lib/use-backdrop-close";

import type { CutoutImage } from "./BackgroundRemover";
import { PhotoEditor, type PlacementMode } from "./PhotoEditor";

interface PhotoEditorDialogProps {
  imagePath: string;
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

function editedName(imagePath: string): string {
  const file = imagePath.split("/").pop() ?? "photo";
  const dot = file.lastIndexOf(".");
  return `${dot > 0 ? file.slice(0, dot) : file}-obrabotka`;
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

export function PhotoEditorDialog({
  imagePath,
  folder,
  canAdd,
  onReplace,
  onAdd,
  onSavingChange,
  onClose,
}: PhotoEditorDialogProps) {
  const [source, setSource] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/admin/api/composer/image/?path=${encodeURIComponent(imagePath)}`)
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить фото");
        return response.blob();
      })
      .then((blob) => !cancelled && setSource(blob))
      .catch((problem) => !cancelled && setError((problem as Error).message));
    return () => {
      cancelled = true;
    };
  }, [imagePath]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const backdrop = useBackdropClose(() => !saving && onClose());

  const place = async (image: Blob, name: string, mode: PlacementMode) => {
    setSaving(true);
    onSavingChange?.(true);
    try {
      const stored = await upload(image, folder, `${name}.png`);
      if (mode === "add") onAdd(stored);
      else onReplace(stored);
      onClose();
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/50 p-4" {...backdrop}>
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col rounded-card bg-brand-50 shadow-xl">
        <div className="flex items-center gap-3 border-b border-brand-100 bg-white p-4">
          <h2 className="text-sm font-bold text-brand-900">Обработка фото</h2>
          <span className="min-w-0 truncate text-xs text-brand-400">{imagePath}</span>
          <button type="button" onClick={onClose} disabled={saving} className="btn-ghost ml-auto px-2 py-1.5" aria-label="Закрыть">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {source ? (
            <PhotoEditor
              initial={{ image: source, name: editedName(imagePath) }}
              canAdd={canAdd}
              onPlace={place}
              onCancel={onClose}
            />
          ) : error ? (
            <p className="flex items-start gap-2 text-sm text-red-700">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-brand-400">
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Загружаем фото…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
