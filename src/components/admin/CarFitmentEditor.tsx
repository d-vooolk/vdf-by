"use client";

import { useEffect, useState } from "react";

import { Combobox, type ComboOption } from "@/components/Combobox";
import { SpinnerIcon, TrashIcon } from "@/components/icons";
import {
  carName,
  years,
  type CarGeneration,
  type CarModel,
  type ProductCar,
} from "@/lib/car-types";

/**
 * Привязка товара к автомобилям.
 *
 * Справочник сюда целиком не приезжает — он весит два мегабайта. Форма
 * ходит за ним уровнями: марки при открытии карточки, модели после выбора
 * марки, поколения после модели (см. /admin/api/cars/). Загруженное
 * складывается по ключу и не выбрасывается: к одной марке возвращаются
 * постоянно — «и это поколение тоже, и вот это».
 *
 * Привязок у товара может быть сколько угодно: одна лампа встаёт в десяток
 * машин. Обратное тоже верно, поэтому связь хранится отдельной таблицей, а
 * не полем в JSON товара (см. миграцию №4).
 */

const THIS_YEAR = new Date().getFullYear();

/** Марка с готовой ссылкой на иконку — её считает сервер. */
interface AdminMark {
  id: string;
  slug: string;
  name: string;
  icon?: string;
}

interface CarsResponse {
  marks?: AdminMark[];
  models?: CarModel[];
  generations?: CarGeneration[];
  error?: string;
}

async function load(query: string): Promise<CarsResponse> {
  // Со слешем на конце: у сайта trailingSlash, и без него каждый запрос
  // проходил бы лишний переход 308.
  const response = await fetch(`/admin/api/cars/${query}`);
  const data = (await response.json().catch(() => ({}))) as CarsResponse;
  if (!response.ok) {
    throw new Error(data.error ?? "Не удалось загрузить справочник машин");
  }
  return data;
}

interface CarFitmentEditorProps {
  value: ProductCar[];
  onChange: (value: ProductCar[]) => void;
}

export function CarFitmentEditor({ value, onChange }: CarFitmentEditorProps) {
  const [marks, setMarks] = useState<AdminMark[] | null>(null);
  const [modelsByMark, setModelsByMark] = useState<Record<string, CarModel[]>>(
    {},
  );
  const [generationsByModel, setGenerationsByModel] = useState<
    Record<string, CarGeneration[]>
  >({});

  const [markId, setMarkId] = useState("");
  const [modelId, setModelId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    load("")
      .then((data) => alive && setMarks(data.marks ?? []))
      .catch((problem: Error) => alive && setError(problem.message));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!markId || modelsByMark[markId]) return;
    let alive = true;
    load(`?mark=${encodeURIComponent(markId)}`)
      .then(
        (data) =>
          alive &&
          setModelsByMark((current) => ({
            ...current,
            [markId]: data.models ?? [],
          })),
      )
      .catch((problem: Error) => alive && setError(problem.message));
    return () => {
      alive = false;
    };
  }, [markId, modelsByMark]);

  useEffect(() => {
    if (!modelId || generationsByModel[modelId]) return;
    let alive = true;
    load(`?model=${encodeURIComponent(modelId)}`)
      .then(
        (data) =>
          alive &&
          setGenerationsByModel((current) => ({
            ...current,
            [modelId]: data.generations ?? [],
          })),
      )
      .catch((problem: Error) => alive && setError(problem.message));
    return () => {
      alive = false;
    };
  }, [modelId, generationsByModel]);

  const models = markId ? modelsByMark[markId] : undefined;
  const generations = modelId ? generationsByModel[modelId] : undefined;

  const mark = marks?.find((item) => item.id === markId);
  const model = models?.find((item) => item.id === modelId);

  const markOptions: ComboOption[] = (marks ?? []).map((item) => ({
    value: item.id,
    label: item.name,
    icon: item.icon,
  }));

  const modelOptions: ComboOption[] = (models ?? []).map((item) => ({
    value: item.id,
    label: item.name,
  }));

  const generationOptions: ComboOption[] = (generations ?? []).map((item) => ({
    value: item.id,
    label: item.name,
    hint: years(item, THIS_YEAR),
  }));

  const remove = (generationId: string) =>
    onChange(value.filter((car) => car.generationId !== generationId));

  /**
   * Поколение выбрано — сразу добавляем и очищаем только третье поле.
   * Марка с моделью остаются: машины заводят пачками, «подходит ко всем
   * рестайлингам» — это четыре поколения подряд у одной модели.
   */
  const pick = (generationId: string) => {
    const generation = generations?.find((item) => item.id === generationId);
    if (!mark || !model || !generation) return;
    if (value.some((item) => item.generationId === generation.id)) return;

    onChange([
      ...value,
      {
        markSlug: mark.slug,
        markName: mark.name,
        modelSlug: model.slug,
        modelName: model.name,
        generationId: generation.id,
        generationSlug: generation.slug,
        generationName: generation.name,
        yearFrom: generation.yearFrom,
        yearTo: generation.yearTo,
      },
    ]);
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {marks === null ? (
        <p className="flex items-center gap-2 text-sm text-brand-400">
          <SpinnerIcon className="h-4 w-4 animate-spin" />
          Загружаем справочник машин…
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Combobox
            value={markId}
            onChange={(next) => {
              setMarkId(next);
              setModelId("");
            }}
            options={markOptions}
            placeholder="Марка"
          />
          <Combobox
            value={modelId}
            onChange={setModelId}
            options={modelOptions}
            placeholder={
              markId && models === undefined ? "Загружаем…" : "Модель"
            }
            disabled={!markId || models === undefined}
          />
          <Combobox
            value=""
            onChange={pick}
            options={generationOptions}
            placeholder={
              modelId && generations === undefined
                ? "Загружаем…"
                : "Поколение — добавить"
            }
            disabled={!modelId || generations === undefined}
          />
        </div>
      )}

      {value.length === 0 ? (
        <p className="text-sm text-brand-400">
          Ни одной машины не выбрано. Товар будет виден в каталоге и в поиске,
          но на страницах подбора его не будет.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {value.map((car) => {
            const period = years(car, THIS_YEAR);
            return (
              <li
                key={car.generationId}
                className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 py-1.5 pr-1.5 pl-3 text-sm"
              >
                <span className="text-brand-900">
                  {carName(
                    { name: car.markName },
                    { name: car.modelName },
                    { name: car.generationName },
                  )}
                  {period && (
                    <span className="ml-1.5 text-xs text-brand-400">
                      {period}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => remove(car.generationId)}
                  title="Убрать машину"
                  className="btn-ghost px-1.5 py-1 text-red-700"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
