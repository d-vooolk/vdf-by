"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

import { CropIcon, EraserIcon, SpinnerIcon, UndoIcon } from "@/components/icons";

interface WatermarkEraserProps {
  image: Blob;
  onApply: (cleaned: Blob) => void;
  onCrop: (cropped: Blob) => void;
  onCancel: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  width: number;
  points: Point[];
}

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Tool = "brush" | "crop";

const STROKE_COLOR = "rgb(239 68 68)";
const BRUSH_MIN = 0.005;
const BRUSH_MAX = 0.1;
const MIN_CROP_SIDE = 16;

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

async function cropImage(image: Blob, rect: CropRect): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  canvas
    .getContext("2d")
    ?.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось обрезать фото"))),
      "image/webp",
      0.95,
    ),
  );
}

function rectBetween(from: Point, to: Point): CropRect {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
}

export function WatermarkEraser({ image, onApply, onCrop, onCancel }: WatermarkEraserProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const cropStart = useRef<Point | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [brush, setBrush] = useState(BRUSH_MAX);
  const [strokeCount, setStrokeCount] = useState(0);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
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
    setSize({ width: element.naturalWidth, height: element.naturalHeight });
    strokes.current = [];
    setStrokeCount(0);
    setCrop(null);
  };

  const point = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * canvas.width, canvas.width),
      y: clamp(((event.clientY - rect.top) / rect.height) * canvas.height, canvas.height),
    };
  };

  const drawSegment = (context: CanvasRenderingContext2D, width: number, from: Point, to: Point) => {
    context.strokeStyle = STROKE_COLOR;
    context.lineWidth = width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes.current) {
      stroke.points.forEach((current, index) =>
        drawSegment(context, stroke.width, stroke.points[Math.max(0, index - 1)], current),
      );
    }
  };

  const begin = (event: PointerEvent<HTMLCanvasElement>) => {
    if (busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = point(event);
    if (tool === "crop") {
      cropStart.current = start;
      setCrop(null);
      return;
    }
    const canvas = event.currentTarget;
    const stroke = { width: brush * Math.max(canvas.width, canvas.height), points: [start] };
    strokes.current = [...strokes.current, stroke];
    setStrokeCount(strokes.current.length);
    const context = canvas.getContext("2d");
    if (context) drawSegment(context, stroke.width, start, start);
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (tool === "crop") {
      if (cropStart.current) setCrop(rectBetween(cropStart.current, point(event)));
      return;
    }
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const stroke = strokes.current.at(-1);
    const previous = stroke?.points.at(-1);
    const context = event.currentTarget.getContext("2d");
    if (!stroke || !previous || !context) return;
    const next = point(event);
    stroke.points.push(next);
    drawSegment(context, stroke.width, previous, next);
  };

  const end = () => {
    if (!cropStart.current) return;
    cropStart.current = null;
    setCrop((rect) => (rect && rect.width >= MIN_CROP_SIDE && rect.height >= MIN_CROP_SIDE ? rect : null));
  };

  const undoStroke = () => {
    strokes.current = strokes.current.slice(0, -1);
    setStrokeCount(strokes.current.length);
    redraw();
  };

  const apply = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !strokeCount) return;
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

  const applyCrop = async () => {
    if (!crop) return;
    setBusy(true);
    setError("");
    try {
      onCrop(await cropImage(image, crop));
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const percent = (value: number, total: number) => `${(value / total) * 100}%`;

  return (
    <div className="space-y-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${tool === "brush" ? "btn-primary" : "btn-secondary"} py-2 text-sm`}
          onClick={() => setTool("brush")}
          disabled={busy}
        >
          <EraserIcon className="h-4 w-4" />
          Кисть
        </button>
        <button
          type="button"
          className={`${tool === "crop" ? "btn-primary" : "btn-secondary"} py-2 text-sm`}
          onClick={() => setTool("crop")}
          disabled={busy}
        >
          <CropIcon className="h-4 w-4" />
          Обрезка
        </button>
      </div>
      <p className="text-sm text-brand-600">
        {tool === "brush"
          ? "Закрасьте кистью водяной знак целиком, с небольшим запасом по краям. Нейросеть дорисует закрашенное место по окружающему фону."
          : "Протяните рамку по фото: останется только то, что внутри неё. Мазки кисти после обрезки сбрасываются."}
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
        {tool === "crop" && crop && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-white shadow-[0_0_0_9999px_rgb(0_0_0/0.45)]"
            style={{
              left: percent(crop.x, size.width),
              top: percent(crop.y, size.height),
              width: percent(crop.width, size.width),
              height: percent(crop.height, size.height),
            }}
          />
        )}
        {busy && (
          <span className="absolute top-3 right-3 rounded-full bg-white/90 p-2 shadow">
            <SpinnerIcon className="h-5 w-5 animate-spin" />
          </span>
        )}
      </div>
      {tool === "brush" ? (
        <>
          <label className="block text-sm">
            <span className="label">Размер кисти</span>
            <input
              type="range"
              min={BRUSH_MIN}
              max={BRUSH_MAX}
              step={0.005}
              value={brush}
              onChange={(event) => setBrush(Number(event.target.value))}
              className="w-full accent-brand-700"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary py-2 text-sm" onClick={apply} disabled={!strokeCount || busy}>
              {busy ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <EraserIcon className="h-4 w-4" />}
              Убрать закрашенное
            </button>
            <button type="button" className="btn-secondary py-2 text-sm" onClick={undoStroke} disabled={!strokeCount || busy}>
              <UndoIcon className="h-4 w-4" />
              Отменить мазок
            </button>
            <button type="button" className="btn-ghost py-2 text-sm" onClick={onCancel} disabled={busy}>
              Отмена
            </button>
          </div>
          <p className="text-xs text-brand-500">
            Обработка идёт на сервере, 5–20 секунд. Самый первый запуск дольше: сервер скачивает модель
            (210 МБ).
          </p>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary py-2 text-sm" onClick={applyCrop} disabled={!crop || busy}>
            {busy ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <CropIcon className="h-4 w-4" />}
            Обрезать
          </button>
          <button type="button" className="btn-secondary py-2 text-sm" onClick={() => setCrop(null)} disabled={!crop || busy}>
            Сбросить рамку
          </button>
          <button type="button" className="btn-ghost py-2 text-sm" onClick={onCancel} disabled={busy}>
            Отмена
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
