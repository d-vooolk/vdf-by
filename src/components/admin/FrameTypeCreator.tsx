"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { CarFitmentEditor } from "@/components/admin/CarFitmentEditor";
import { PlusIcon, SpinnerIcon } from "@/components/icons";
import { years, type ProductCar } from "@/lib/car-types";

import { Switch } from "./Toggles";
import { renderOne } from "./FrameTypeComposer";

const THIS_YEAR = new Date().getFullYear();

interface CreateLine {
  car: string;
  status: "created" | "skipped" | "error";
  productId: string;
  title: string;
  message: string;
  photo: string;
}

interface CreateResponse {
  status?: "created" | "skipped";
  productId?: string;
  title?: string;
  message?: string;
  error?: string;
}

function carLabel(car: ProductCar): string {
  return `${car.markName} ${car.modelName} ${car.generationName} ${years(car, THIS_YEAR)}`.trim();
}

async function createOne(categoryId: string, type: string, generationId: string): Promise<CreateResponse> {
  const response = await fetch("/admin/api/frame-types/create/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId, type, generationId }),
  });
  const data = (await response.json().catch(() => ({}))) as CreateResponse;
  if (!response.ok) throw new Error(data.error ?? `Ошибка ${response.status}`);
  return data;
}

export function FrameTypeCreator({
  categoryId,
  type,
  existingGenerationIds,
  hasFrameImage,
}: {
  categoryId: string;
  type: string;
  existingGenerationIds: string[];
  hasFrameImage: boolean;
}) {
  const router = useRouter();
  const [cars, setCars] = useState<ProductCar[]>([]);
  const [withPhotos, setWithPhotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lines, setLines] = useState<CreateLine[]>([]);
  const stopRef = useRef(false);

  const existing = new Set(existingGenerationIds);
  const fresh = cars.filter((car) => !existing.has(car.generationId));
  const repeated = cars.length - fresh.length;

  const run = async () => {
    setBusy(true);
    setLines([]);
    setProgress(0);
    stopRef.current = false;
    for (const [index, car] of fresh.entries()) {
      if (stopRef.current) break;
      let line: CreateLine;
      try {
        const result = await createOne(categoryId, type, car.generationId);
        line = {
          car: carLabel(car),
          status: result.status ?? "error",
          productId: result.productId ?? "",
          title: result.title ?? "",
          message: result.message ?? "",
          photo: "",
        };
        if (line.status === "created" && withPhotos && hasFrameImage && !stopRef.current) {
          try {
            const photo = await renderOne(categoryId, type, line.productId);
            line.photo = photo.status === "done" ? "фото готово" : `фото: ${photo.message ?? "не сделано"}`;
          } catch (problem) {
            line.photo = `фото: ${(problem as Error).message}`;
          }
        }
      } catch (problem) {
        line = {
          car: carLabel(car),
          status: "error",
          productId: "",
          title: "",
          message: (problem as Error).message,
          photo: "",
        };
      }
      setLines((current) => [...current, line]);
      setProgress(index + 1);
    }
    setBusy(false);
    setCars([]);
    router.refresh();
  };

  const created = lines.filter((line) => line.status === "created").length;

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

      <CarFitmentEditor value={cars} onChange={setCars} />

      {repeated > 0 && (
        <p className="text-xs text-amber-800">
          Для {repeated} из выбранных поколений карточка этого типа уже есть — они пропустятся.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Switch
          checked={withPhotos && hasFrameImage}
          onChange={setWithPhotos}
          label="Сразу сделать фото рамки с автомобилем"
        />
        {!hasFrameImage && (
          <span className="text-xs text-brand-400">
            Сначала сохраните фото рамки и оформление в блоке ниже.
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
          Создать карточки ({fresh.length})
        </button>
        {busy && (
          <>
            <span className="tnum text-sm text-brand-600">
              {progress} / {fresh.length}
            </span>
            <button type="button" className="btn-ghost py-1 text-xs" onClick={() => (stopRef.current = true)}>
              Остановить
            </button>
          </>
        )}
        {!busy && lines.length > 0 && (
          <span className="text-sm text-emerald-700">
            Создано: {created} из {lines.length}
          </span>
        )}
      </div>
      {busy && (
        <p className="text-xs text-brand-400">
          Нейросеть пишет текст 10–30 секунд на карточку. Не закрывайте страницу до конца.
        </p>
      )}

      {lines.length > 0 && (
        <ul className="max-h-80 space-y-1 overflow-y-auto text-xs">
          {lines.map((line, index) => (
            <li
              key={`${line.car}-${index}`}
              className={
                line.status === "error"
                  ? "text-red-700"
                  : line.status === "skipped"
                    ? "text-amber-800"
                    : "text-brand-700"
              }
            >
              {line.productId ? (
                <Link href={`/admin/products/${line.productId}/`} className="underline">
                  {line.title || line.car}
                </Link>
              ) : (
                line.car
              )}
              {line.status === "skipped" && " — пропущено"}
              {line.message && `: ${line.message}`}
              {line.photo && ` · ${line.photo}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
