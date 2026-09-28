"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

import { EraserIcon, SpinnerIcon } from "@/components/icons";

interface WatermarkEraserProps {
  image: Blob;
  onApply: (cleaned: Blob) => void;
  onCancel: () => void;
}

const STROKE_COLOR = "rgb(239 68 68)";

async function eraseWatermark(image: Blob, mask: Blob): Promise<Blob> {
  const form = new FormData();
  form.set("image", image, "product.webp");
  form.set("mask", mask, "mask.png");
  const response = await fetch("/admin/api/composer/inpaint/", { method: "POST", body: form });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Ошибка ${response.status}`);
  }
  return response.blob();
}

export function WatermarkEraser({ image, onApply, onCancel }: WatermarkEraserProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [brush, setBrush] = useState(0.03);
  const [painted, setPainted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = imageRef.current;
    if (!element) return;
    const url = URL.createObjectURL(image);
    element.src = url;
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const fitCanvas = (element: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    setPainted(false);
  };

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const paint = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.strokeStyle = STROKE_COLOR;
    context.lineWidth = brush * Math.max(canvas.width, canvas.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    setPainted(true);
  };

  const begin = (event: PointerEvent<HTMLCanvasElement>) => {
    if (busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = point(event);
    lastPoint.current = start;
    paint(start, start);
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!lastPoint.current) return;
    const next = point(event);
    paint(lastPoint.current, next);
    lastPoint.current = next;
  };

  const end = () => {
    lastPoint.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setPainted(false);
  };

  const apply = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !painted) return;
    setBusy(true);
    setError("");
    try {
      const mask = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Не удалось прочитать мазки"))), "image/png"),
      );
      onApply(await eraseWatermark(image, mask));
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3">
      <p className="text-sm text-brand-600">
        Закрасьте кистью водяной знак целиком, с небольшим запасом по краям. Нейросеть дорисует
        закрашенное место по окружающему фону.
      </p>
      <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg bg-white">
        <img
          ref={imageRef}
          alt=""
          draggable={false}
          onLoad={(event) => fitCanvas(event.currentTarget)}
          className="block max-h-[28rem] w-auto max-w-full select-none"
        />
        <canvas
          ref={canvasRef}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className={`absolute inset-0 h-full w-full cursor-crosshair touch-none opacity-50 ${busy ? "pointer-events-none" : ""}`}
        />
        {busy && (
          <span className="absolute top-3 right-3 rounded-full bg-white/90 p-2 shadow">
            <SpinnerIcon className="h-5 w-5 animate-spin" />
          </span>
        )}
      </div>
      <label className="block text-sm">
        <span className="label">Размер кисти</span>
        <input
          type="range"
          min={0.005}
          max={0.1}
          step={0.005}
          value={brush}
          onChange={(event) => setBrush(Number(event.target.value))}
          className="w-full accent-brand-700"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary py-2 text-sm" onClick={apply} disabled={!painted || busy}>
          {busy ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <EraserIcon className="h-4 w-4" />}
          Убрать закрашенное
        </button>
        <button type="button" className="btn-secondary py-2 text-sm" onClick={clear} disabled={!painted || busy}>
          Стереть мазки
        </button>
        <button type="button" className="btn-ghost py-2 text-sm" onClick={onCancel} disabled={busy}>
          Отмена
        </button>
      </div>
      <p className="text-xs text-brand-500">
        Обработка идёт на сервере, 5–20 секунд. Самый первый запуск дольше: сервер скачивает модель
        (210 МБ).
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
