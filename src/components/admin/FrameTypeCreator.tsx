"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { setPlannedFrameCarsAction } from "@/app/admin/actions";
import { CarFitmentEditor } from "@/components/admin/CarFitmentEditor";
import { PlusIcon, SpinnerIcon } from "@/components/icons";
import { years, type ProductCar } from "@/lib/car-types";

import { Switch } from "./Toggles";

const THIS_YEAR = new Date().getFullYear();
const RETRY_PASSES = 2;
const RETRY_DELAYS = [5000, 20000];

type Step = "create" | "description" | "faq" | "photo";

const STEP_LABELS: Record<Step, string> = {
  create: "карточка",
  description: "описание",
  faq: "вопросы-ответы",
  photo: "фото",
};

interface Item {
  car: ProductCar;
  productId: string;
  title: string;
  done: Step[];
  notes: string[];
  failed: { step: Step; message: string } | null;
}

class StopError extends Error {}

function carLabel(car: ProductCar): string {
  return `${car.markName} ${car.modelName} ${car.generationName} ${years(car, THIS_YEAR)}`.trim();
}

async function post<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("нет связи с сервером");
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 401) throw new StopError("Нужно войти заново");
  if (!response.ok) {
    throw new Error(
      data.error ??
        (response.status === 502 || response.status === 504
          ? `сервер не дождался ответа (${response.status})`
          : `ошибка ${response.status}`),
    );
  }
  return data;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function FrameTypeCreator({
  categoryId,
  type,
  existingGenerationIds,
  plannedCars,
  hasFrameImage,
}: {
  categoryId: string;
  type: string;
  existingGenerationIds: string[];
  plannedCars: ProductCar[];
  hasFrameImage: boolean;
}) {
  const router = useRouter();
  const [cars, setCars] = useState<ProductCar[]>(() => {
    const existing = new Set(existingGenerationIds);
    return plannedCars.filter((car) => !existing.has(car.generationId));
  });
  const savedCars = useRef(plannedCars.map((car) => car.generationId).join(","));

  useEffect(() => {
    const ids = cars.map((car) => car.generationId);
    const key = ids.join(",");
    if (key === savedCars.current) return;
    savedCars.current = key;
    void setPlannedFrameCarsAction(categoryId, type, ids);
  }, [cars, categoryId, type]);
  const [withPhotos, setWithPhotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [fatal, setFatal] = useState("");
  const stopRef = useRef(false);

  const existing = new Set(existingGenerationIds);
  const known = new Set(items.map((item) => item.car.generationId));
  const fresh = cars.filter((car) => !existing.has(car.generationId) || known.has(car.generationId));
  const repeated = cars.length - fresh.length;
  const photos = withPhotos && hasFrameImage;
  const steps: Step[] = photos ? ["create", "description", "faq", "photo"] : ["create", "description", "faq"];

  const complete = (item: Item) => steps.every((step) => item.done.includes(step));

  const runStep = async (item: Item, step: Step): Promise<void> => {
    if (step === "create") {
      const result = await post<{ status: "created" | "skipped"; productId: string; title: string }>(
        "/admin/api/frame-types/create/",
        { categoryId, type, generationId: item.car.generationId },
      );
      item.productId = result.productId;
      item.title = result.title;
      return;
    }
    if (step === "photo") {
      const result = await post<{ status: "done" | "skipped"; message?: string }>(
        "/admin/api/frame-types/render/",
        { categoryId, type, productId: item.productId },
      );
      if (result.status === "skipped") item.notes.push(`фото не сделано: ${result.message ?? ""}`);
      return;
    }
    const result = await post<{ status: "done" | "skipped"; message: string }>("/admin/api/frame-types/fill/", {
      productId: item.productId,
      part: step,
    });
    if (result.status === "skipped" && result.message === "нейросеть не подключена") {
      item.notes.push(`${STEP_LABELS[step]}: нейросеть не подключена`);
    }
  };

  const process = async (item: Item) => {
    item.failed = null;
    for (const step of steps) {
      if (item.done.includes(step)) continue;
      if (stopRef.current) return;
      try {
        await runStep(item, step);
        item.done.push(step);
      } catch (problem) {
        if (problem instanceof StopError) throw problem;
        item.failed = { step, message: (problem as Error).message };
        return;
      } finally {
        setItems((current) => [...current]);
      }
    }
  };

  const run = async () => {
    setBusy(true);
    setFatal("");
    stopRef.current = false;
    const previous = new Map(items.map((item) => [item.car.generationId, item]));
    const queue: Item[] = fresh.map(
      (car) =>
        previous.get(car.generationId) ?? {
          car,
          productId: "",
          title: "",
          done: [],
          notes: [],
          failed: null,
        },
    );
    setItems(queue);

    try {
      for (let pass = 0; pass <= RETRY_PASSES; pass += 1) {
        const pending = queue.filter((item) => !complete(item));
        if (!pending.length || stopRef.current) break;
        if (pass > 0) {
          const delay = RETRY_DELAYS[pass - 1] ?? 20000;
          setStatus(`Повтор для несозданных (${pending.length}) через ${Math.round(delay / 1000)} с…`);
          await pause(delay);
          if (stopRef.current) break;
        }
        for (const [index, item] of pending.entries()) {
          if (stopRef.current) break;
          setStatus(
            `${pass ? `Повтор ${pass}: ` : ""}${index + 1} / ${pending.length} — ${carLabel(item.car)}`,
          );
          await process(item);
        }
      }
    } catch (problem) {
      setFatal((problem as Error).message);
    }

    const finished = new Set(queue.filter(complete).map((item) => item.car.generationId));
    setCars((current) => current.filter((car) => !finished.has(car.generationId)));
    setStatus("");
    setBusy(false);
    router.refresh();
  };

  const doneCount = items.filter(complete).length;
  const failedCount = items.filter((item) => !complete(item)).length;

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold text-brand-900">Создать карточки для машин</h2>
        <p className="mt-1 text-sm text-brand-500">
          Выберите поколения — на каждое создастся своя карточка: название по шаблону, артикул
          «номер-дополнение-{type}», цены, остаток, складской номер и характеристики типа, описание и
          вопросы-ответы пишет нейросеть по описанию типа. Что не заполнилось, попадёт в
          «Незаполненные».
        </p>
      </div>

      <CarFitmentEditor
        value={cars}
        onChange={setCars}
        emptyNote="Машины не выбраны. Выберите марку, модель и поколение — можно добавить сколько угодно."
      />

      {repeated > 0 && (
        <p className="text-xs text-amber-800">
          Для {repeated} из выбранных поколений карточка этого типа уже есть — они пропустятся.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Switch checked={photos} onChange={setWithPhotos} label="Сразу сделать фото рамки с автомобилем" />
        {!hasFrameImage && (
          <span className="text-xs text-brand-400">
            Сначала сохраните фото рамки и оформление в блоке выше.
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={busy || fresh.length === 0}
          className="btn-primary py-2 text-sm"
        >
          {busy ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
          {items.some((item) => !complete(item)) && !busy
            ? `Повторить для несозданных (${fresh.length})`
            : `Создать карточки (${fresh.length})`}
        </button>
        {busy && (
          <button type="button" className="btn-ghost py-1 text-xs" onClick={() => (stopRef.current = true)}>
            Остановить
          </button>
        )}
        {!busy && items.length > 0 && (
          <span className={failedCount ? "text-sm text-amber-800" : "text-sm text-emerald-700"}>
            Готово: {doneCount} из {items.length}
            {failedCount > 0 && ` — ${failedCount} не удалось, они остались в списке выше`}
          </span>
        )}
      </div>
      {status && <p className="text-xs text-brand-500">{status}</p>}
      {busy && (
        <p className="text-xs text-brand-400">
          Нейросеть пишет текст 10–30 секунд на шаг. Не закрывайте страницу до конца.
        </p>
      )}
      {fatal && <p className="text-sm text-red-700">{fatal}</p>}

      {items.length > 0 && (
        <ul className="max-h-80 space-y-1 overflow-y-auto text-xs">
          {items.map((item) => {
            const ready = complete(item);
            return (
              <li
                key={item.car.generationId}
                className={ready ? "text-brand-700" : item.failed ? "text-red-700" : "text-brand-500"}
              >
                {item.productId ? (
                  <Link href={`/admin/products/${item.productId}/`} className="underline">
                    {item.title || carLabel(item.car)}
                  </Link>
                ) : (
                  carLabel(item.car)
                )}
                {" — "}
                {ready
                  ? "готово"
                  : item.failed
                    ? `не получилось на шаге «${STEP_LABELS[item.failed.step]}»: ${item.failed.message}`
                    : `сделано: ${item.done.map((step) => STEP_LABELS[step]).join(", ") || "ничего"}`}
                {item.notes.length > 0 && ` · ${item.notes.join("; ")}`}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
