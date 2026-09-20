import Link from "next/link";

import { ImagePlaceholder, Picture } from "@/components/Picture";
import {
  generationUrl,
  markUrl,
  modelUrl,
  years,
  type FitGeneration,
  type FitMark,
  type FitModel,
} from "@/lib/car-types";
import { pluralize } from "@/lib/format";
import { getImage } from "@/lib/images";

/**
 * Плитки справочника автомобилей: марки, модели, поколения.
 *
 * Один набор на все места, где показываются машины, — главную, страницы
 * подбора и блок «Подходит к автомобилям» на карточке товара. Причина та
 * же, по которой одна плитка у разделов каталога: разъехавшись, они
 * разъедутся молча.
 *
 * Все три — обычные ссылки, отрисованные на сервере. Подбор на главной
 * поверх них умеет переключать шаги без перезагрузки, но и без JavaScript
 * до нужной машины можно дойти в три клика, а краулер видит всю сетку
 * страниц подбора без исполнения скриптов.
 */

export function MarkTile({
  mark,
  priority = false,
}: {
  mark: FitMark;
  priority?: boolean;
}) {
  return (
    <Link
      href={markUrl(mark.slug)}
      className="group card card-link flex flex-col items-center gap-2 px-3 py-4 text-center"
    >
      <span className="flex h-12 w-12 items-center justify-center">
        {mark.logo ? (
          <Picture
            entry={getImage(mark.logo)}
            alt=""
            sizes="48px"
            priority={priority}
            className="h-full w-full object-contain"
          />
        ) : (
          <ImagePlaceholder className="h-full w-full rounded-lg" />
        )}
      </span>

      <span className="text-sm leading-snug font-semibold text-brand-900 transition-colors group-hover:text-brand-600">
        {mark.name}
      </span>
      <span className="text-xs text-brand-400">
        {pluralize(mark.models.length, "модель", "модели", "моделей")}
      </span>
    </Link>
  );
}

export function MarkGrid({
  marks,
  priorityCount = 0,
}: {
  marks: FitMark[];
  priorityCount?: number;
}) {
  if (!marks.length) return null;

  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {marks.map((mark, position) => (
        <li key={mark.id}>
          <MarkTile mark={mark} priority={position < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Модели — списком, а не плитками: у модели нет своей картинки, и плитка с
 * заглушкой вместо фото выглядит сломанной, а не лаконичной.
 */
export function ModelList({ mark }: { mark: FitMark }) {
  if (!mark.models.length) return null;

  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {mark.models.map((model) => (
        <li key={model.id}>
          <Link
            href={modelUrl(mark.slug, model.slug)}
            className="card card-link flex items-center justify-between gap-3 px-4 py-3"
          >
            <span className="text-[15px] font-semibold text-brand-900">
              {model.name}
            </span>
            <span className="shrink-0 text-xs text-brand-400">
              {pluralize(
                model.generations.length,
                "поколение",
                "поколения",
                "поколений",
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function GenerationTile({
  mark,
  model,
  generation,
  currentYear,
  priority = false,
}: {
  mark: FitMark;
  model: FitModel;
  generation: FitGeneration;
  currentYear: number;
  priority?: boolean;
}) {
  const period = years(generation, currentYear);

  return (
    <Link
      href={generationUrl(mark.slug, model.slug, generation.slug)}
      className="group card card-link flex flex-col overflow-hidden"
    >
      <span className="relative block aspect-[16/10] overflow-hidden bg-white">
        <Picture
          entry={getImage(generation.photo)}
          alt=""
          sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 320px"
          priority={priority}
          className="h-full w-full object-contain transition-transform duration-300 ease-out group-hover:scale-105"
        />
      </span>

      <span className="border-t border-brand-100 px-3 py-3">
        <span className="block text-[15px] leading-snug font-semibold text-brand-900 transition-colors group-hover:text-brand-600">
          {model.name} {generation.name}
        </span>
        {period && (
          <span className="mt-0.5 block text-xs text-brand-400">{period}</span>
        )}
      </span>
    </Link>
  );
}

export function GenerationGrid({
  mark,
  model,
  currentYear,
  priorityCount = 0,
}: {
  mark: FitMark;
  model: FitModel;
  currentYear: number;
  priorityCount?: number;
}) {
  if (!model.generations.length) return null;

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {model.generations.map((generation, position) => (
        <li key={generation.id}>
          <GenerationTile
            mark={mark}
            model={model}
            generation={generation}
            currentYear={currentYear}
            priority={position < priorityCount}
          />
        </li>
      ))}
    </ul>
  );
}
