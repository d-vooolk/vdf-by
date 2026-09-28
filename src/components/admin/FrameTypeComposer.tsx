"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ImagePlusIcon, SpinnerIcon } from "@/components/icons";
import type { ComposerSettings } from "@/lib/composer";

import { ImageComposer, type ComposerState } from "./ImageComposer";

const RETRY_PASSES = 2;
const RETRY_DELAYS = [5000, 20000];

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RenderLine {
  productId: string;
  title: string;
  status: "done" | "skipped" | "error";
  car: string;
  message: string;
}

interface RenderResponse {
  status?: "done" | "skipped";
  car?: string;
  message?: string;
  error?: string;
}

async function saveFrame(categoryId: string, type: string, state: ComposerState): Promise<void> {
  if (!state.product) throw new Error("Загрузите фото рамки");
  const form = new FormData();
  form.set("categoryId", categoryId);
  form.set("type", type);
  form.set("image", state.product, "frame.png");
  form.set("settings", JSON.stringify(state.settings));
  const response = await fetch("/admin/api/frame-types/frame/", { method: "POST", body: form });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Ошибка ${response.status}`);
  }
}

export async function renderOne(categoryId: string, type: string, productId: string): Promise<RenderResponse> {
  let response: Response;
  try {
    response = await fetch("/admin/api/frame-types/render/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, type, productId }),
    });
  } catch {
    throw new Error("нет связи с сервером");
  }
  const data = (await response.json().catch(() => ({}))) as RenderResponse;
  if (!response.ok) {
    throw new Error(
      data.error ??
        (response.status === 502 || response.status === 504
          ? `сервер не ответил (${response.status})`
          : `Ошибка ${response.status}`),
    );
  }
  return data;
}

export function FrameTypeComposer({
  categoryId,
  type,
  products,
  sampleGenerationId,
  hasFrameImage,
  settings,
}: {
  categoryId: string;
  type: string;
  products: Array<{ id: string; title: string }>;
  sampleGenerationId?: string;
  hasFrameImage: boolean;
  settings: ComposerSettings | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"save" | "render" | null>(null);
  const [lines, setLines] = useState<RenderLine[]>([]);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const stopRef = useRef(false);

  const frameUrl = hasFrameImage
    ? `/admin/api/frame-types/frame/?category=${encodeURIComponent(categoryId)}&type=${encodeURIComponent(type)}`
    : undefined;

  const saveOnly = async (state: ComposerState) => {
    setBusy("save");
    setError("");
    try {
      await saveFrame(categoryId, type, state);
      setSaved(true);
      router.refresh();
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const renderAll = async (state: ComposerState, onlyFailed: boolean) => {
    setBusy("render");
    setError("");
    stopRef.current = false;
    const failedIds = new Set(lines.filter((line) => line.status === "error").map((line) => line.productId));
    const queue = onlyFailed ? products.filter((product) => failedIds.has(product.id)) : products;
    const results = new Map<string, RenderLine>(
      onlyFailed ? lines.map((line) => [line.productId, line]) : [],
    );
    const publish = () => setLines([...results.values()]);
    publish();
    try {
      await saveFrame(categoryId, type, state);
      setSaved(true);
      for (let pass = 0; pass <= RETRY_PASSES; pass += 1) {
        const pending = queue.filter((product) => {
          const status = results.get(product.id)?.status;
          return status !== "done" && status !== "skipped";
        });
        if (!pending.length || stopRef.current) break;
        if (pass > 0) {
          const delay = RETRY_DELAYS[pass - 1] ?? 20000;
          setProgress(`Повтор для неудавшихся (${pending.length}) через ${Math.round(delay / 1000)} с…`);
          await pause(delay);
          if (stopRef.current) break;
        }
        for (const [index, product] of pending.entries()) {
          if (stopRef.current) break;
          setProgress(`${pass ? `Повтор ${pass}: ` : ""}${index + 1} / ${pending.length}`);
          try {
            const result = await renderOne(categoryId, type, product.id);
            results.set(product.id, {
              productId: product.id,
              title: product.title,
              status: result.status ?? "error",
              car: result.car ?? "",
              message: result.message ?? "",
            });
          } catch (problem) {
            results.set(product.id, {
              productId: product.id,
              title: product.title,
              status: "error",
              car: "",
              message: (problem as Error).message,
            });
          }
          publish();
        }
      }
      router.refresh();
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setProgress("");
      setBusy(null);
    }
  };

  const doneCount = lines.filter((line) => line.status === "done").length;
  const problems = lines.filter((line) => line.status !== "done");
  const failedCount = lines.filter((line) => line.status === "error").length;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold text-brand-900">Фото товаров: рамка и автомобиль</h2>
        <p className="mt-1 text-sm text-brand-500">
          Настройте картинку на любой машине. При генерации для каждого товара типа подставится его
          автомобиль (если машин несколько — самое новое поколение) и своя надпись, а готовая картинка
          встанет главным фото товара. Повторная генерация заменяет прошлую картинку, а не добавляет
          ещё одну.
        </p>
      </div>

      <ImageComposer
        initialGenerationId={sampleGenerationId}
        initialProductUrl={frameUrl}
        initialSettings={settings}
        productHeading="Фото рамки"
        uploadLabel="Загрузить фото рамки"
        labelNote="Это надпись только для примера: у каждого товара она соберётся из его машины."
        actions={(state) => (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => saveOnly(state)}
                disabled={!state.product || busy !== null}
              >
                {busy === "save" && <SpinnerIcon className="h-4 w-4 animate-spin" />}
                Сохранить оформление
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={() => renderAll(state, false)}
                disabled={!state.ready || busy !== null || products.length === 0}
              >
                {busy === "render" ? (
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlusIcon className="h-4 w-4" />
                )}
                Сгенерировать для всех товаров ({products.length})
              </button>
              {failedCount > 0 && busy === null && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => renderAll(state, true)}
                  disabled={!state.ready}
                >
                  Повторить для неудавшихся ({failedCount})
                </button>
              )}
            </div>
            {busy === "render" && (
              <div className="flex items-center gap-3 text-sm text-brand-600">
                <span className="tnum">{progress}</span>
                <button type="button" className="btn-ghost py-1 text-xs" onClick={() => (stopRef.current = true)}>
                  Остановить
                </button>
              </div>
            )}
            {saved && busy === null && lines.length === 0 && (
              <p className="text-sm text-emerald-700">Фото рамки и оформление сохранены.</p>
            )}
            {lines.length > 0 && busy === null && (
              <p className={failedCount ? "text-sm text-amber-800" : "text-sm text-emerald-700"}>
                Готово: {doneCount} из {lines.length}.
                {failedCount > 0 && ` Не удалось: ${failedCount} — нажмите «Повторить для неудавшихся».`}
              </p>
            )}
            {problems.length > 0 && (
              <ul className="max-h-60 space-y-1 overflow-y-auto text-xs">
                {problems.map((line) => (
                  <li key={line.productId} className={line.status === "error" ? "text-red-700" : "text-amber-800"}>
                    {line.title}
                    {line.car && ` (${line.car})`}: {line.message}
                  </li>
                ))}
              </ul>
            )}
            {error && <p className="text-sm text-red-700">{error}</p>}
          </div>
        )}
      />
    </section>
  );
}
