"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AlertIcon, DownloadIcon, EraserIcon, FlipIcon, SpinnerIcon, UndoIcon, UploadIcon } from "@/components/icons";

import { WatermarkEraser } from "./WatermarkEraser";

const MAX_BYTES = 20 * 1024 * 1024;
const HISTORY_LIMIT = 20;
const SAVE_FOLDER = "obrabotka";

interface UploadReply {
  error?: string;
  uploaded?: Array<{ path: string; thumb: string }>;
  problems?: string[];
}

async function readError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `Ошибка ${response.status}`;
}

async function redraw(image: Blob, paint: (context: CanvasRenderingContext2D, bitmap: ImageBitmap) => void): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Браузер не умеет рисовать картинки");
  paint(context, bitmap);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Не удалось собрать картинку"))), "image/png"),
  );
}

const onWhite = (image: Blob) =>
  redraw(image, (context, bitmap) => {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);
  });

const mirrored = (image: Blob) =>
  redraw(image, (context, bitmap) => {
    context.translate(bitmap.width, 0);
    context.scale(-1, 1);
    context.drawImage(bitmap, 0, 0);
  });

async function cutBackground(image: Blob): Promise<Blob> {
  const form = new FormData();
  form.set("image", image, "photo.png");
  const response = await fetch("/admin/api/composer/cutout/", { method: "POST", body: form });
  if (!response.ok) throw new Error(await readError(response));
  return response.blob();
}

function baseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name) || "photo";
}

export function PhotoEditor() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("photo");
  const [history, setHistory] = useState<Blob[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [erasing, setErasing] = useState(false);
  const [saved, setSaved] = useState<{ path: string; thumb: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const current = history[history.length - 1] ?? null;

  const preview = useMemo(() => (current ? URL.createObjectURL(current) : ""), [current]);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const open = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Это не картинка");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Фото больше 20 МБ");
      return;
    }
    setError("");
    setSaved(null);
    setName(baseName(file.name));
    setHistory([file]);
  };

  const push = (image: Blob) => {
    setSaved(null);
    setHistory((list) => [...list, image].slice(-HISTORY_LIMIT));
  };

  const run = async (label: string, step: (image: Blob) => Promise<Blob>) => {
    if (!current || busy) return;
    setBusy(label);
    setError("");
    try {
      push(await step(current));
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy("");
    }
  };

  const download = () => {
    if (!preview) return;
    const link = document.createElement("a");
    link.href = preview;
    link.download = `${name}.png`;
    link.click();
  };

  const save = async () => {
    if (!current || busy) return;
    setBusy("Сохраняем");
    setError("");
    try {
      const form = new FormData();
      form.set("folder", SAVE_FOLDER);
      form.append("files", current, `${name}.png`);
      const response = await fetch("/admin/api/upload/", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as UploadReply;
      const stored = data.uploaded?.[0];
      if (!response.ok || !stored) throw new Error(data.error ?? data.problems?.[0] ?? `Ошибка ${response.status}`);
      setSaved(stored);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy("");
    }
  };

  if (!current) {
    return (
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          open(event.dataTransfer.files[0]);
        }}
        className={`card flex flex-col items-center justify-center gap-3 border-2 border-dashed p-12 text-center ${
          dragging ? "border-brand-500 bg-brand-50" : "border-brand-200"
        }`}
      >
        <UploadIcon className="h-8 w-8 text-brand-400" />
        <p className="text-sm text-brand-600">Перетащите фото сюда или выберите файл</p>
        <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary py-2 text-sm">
          Выбрать фото
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          className="hidden"
          onChange={(event) => open(event.target.files?.[0])}
        />
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  if (erasing) {
    return (
      <div className="card p-4">
        <WatermarkEraser
          image={current}
          onApply={(cleaned) => {
            push(cleaned);
            setErasing(false);
          }}
          onCrop={(cropped) => {
            push(cropped);
            setErasing(false);
          }}
          onCancel={() => setErasing(false)}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="card overflow-hidden p-3">
        <div className="relative flex min-h-80 items-center justify-center rounded-xl bg-[repeating-conic-gradient(#e8eeee_0_25%,#ffffff_0_50%)] bg-[length:24px_24px]">
          {preview && (
            <img src={preview} alt="Обрабатываемое фото" className="max-h-[70vh] max-w-full object-contain" />
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <span className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm text-brand-800 shadow-pop">
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                {busy}…
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="card space-y-4 p-4">
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-brand-900">Обработка</h2>
          <div className="grid gap-2">
            <button type="button" disabled={!!busy} onClick={() => run("Убираем фон", cutBackground)} className="btn-secondary justify-start py-2 text-sm">
              Убрать фон нейросетью
            </button>
            <button type="button" disabled={!!busy} onClick={() => run("Заливаем белым", onWhite)} className="btn-secondary justify-start py-2 text-sm">
              Залить прозрачное белым
            </button>
            <button type="button" disabled={!!busy} onClick={() => setErasing(true)} className="btn-secondary justify-start py-2 text-sm">
              <EraserIcon className="h-4 w-4" />
              Стереть надпись или обрезать
            </button>
            <button type="button" disabled={!!busy} onClick={() => run("Отражаем", mirrored)} className="btn-secondary justify-start py-2 text-sm">
              <FlipIcon className="h-4 w-4" />
              Отразить по горизонтали
            </button>
            <button
              type="button"
              disabled={!!busy || history.length < 2}
              onClick={() => {
                setSaved(null);
                setHistory((list) => list.slice(0, -1));
              }}
              className="btn-ghost justify-start py-2 text-sm"
            >
              <UndoIcon className="h-4 w-4" />
              Отменить шаг
            </button>
          </div>
        </div>

        <div className="space-y-2 border-t border-brand-100 pt-4">
          <h2 className="text-sm font-bold text-brand-900">Результат</h2>
          <label className="label" htmlFor="photo-editor-name">
            Имя файла
          </label>
          <input
            id="photo-editor-name"
            value={name}
            onChange={(event) => setName(event.target.value || "photo")}
            className="field py-2 text-sm"
          />
          <div className="grid gap-2">
            <button type="button" disabled={!!busy} onClick={download} className="btn-primary py-2 text-sm">
              <DownloadIcon className="h-4 w-4" />
              Скачать PNG
            </button>
            <button type="button" disabled={!!busy || !!saved} onClick={save} className="btn-secondary py-2 text-sm">
              {saved ? "Сохранено на сайте" : "Сохранить в фото сайта"}
            </button>
          </div>
          {saved && (
            <p className="text-xs text-brand-500">
              Путь: <span className="tnum break-all text-brand-800">{saved.path}</span> — его можно выбрать в
              галерее товара или раздела.
            </p>
          )}
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
              setHistory([]);
              setSaved(null);
              setError("");
            }}
            className="btn-ghost w-full py-2 text-sm"
          >
            Открыть другое фото
          </button>
        </div>

        {error && (
          <p className="flex items-start gap-2 text-sm text-red-700">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
