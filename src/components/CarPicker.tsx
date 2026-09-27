"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Combobox, type ComboOption } from "@/components/Combobox";
import { generationUrl, markUrl, modelUrl } from "@/lib/car-types";

/**
 * Поиск по автомобилю: марка, модель, поколение и кнопка.
 *
 * Заполнять всё не обязательно, и это главное в поведении. Выбрали только
 * марку — покажем всё, что подходит к любой её модели; добавили модель —
 * сузим до модели; дошли до поколения — останется только то, что встаёт на
 * эту машину. Каждый уровень — отдельная страница, поэтому результат можно
 * сохранить в закладки и он же индексируется поиском.
 *
 * В списках только те машины, к которым привязан хотя бы один товар:
 * предлагать выбор, который заведомо ничего не найдёт, нельзя.
 */

export interface PickerGeneration {
  /** slug */
  s: string;
  /** название */
  n: string;
  /** годы выпуска, уже готовой строкой */
  y: string;
}

export interface PickerModel {
  s: string;
  n: string;
  g: PickerGeneration[];
}

export interface PickerMarkHead {
  s: string;
  n: string;
  /** ссылка на логотип */
  l?: string;
}

export interface PickerMark extends PickerMarkHead {
  m: PickerModel[];
}

let treeRequest: Promise<PickerMark[]> | null = null;

function loadTree(): Promise<PickerMark[]> {
  treeRequest ??= fetch("/car-tree.json")
    .then((response) => (response.ok ? (response.json() as Promise<PickerMark[]>) : []))
    .catch(() => {
      treeRequest = null;
      return [];
    });
  return treeRequest;
}

export function CarPicker({ marks }: { marks: PickerMarkHead[] }) {
  const router = useRouter();
  const [tree, setTree] = useState<PickerMark[] | null>(null);
  const [markSlug, setMarkSlug] = useState("");
  const [modelSlug, setModelSlug] = useState("");
  const [generationSlug, setGenerationSlug] = useState("");

  const prefetchTree = () => {
    if (!tree) void loadTree().then(setTree);
  };

  const markHead = marks.find((item) => item.s === markSlug);
  const mark = tree?.find((item) => item.s === markSlug);
  const model = mark?.m.find((item) => item.s === modelSlug);
  const generation = model?.g.find((item) => item.s === generationSlug);

  const markOptions: ComboOption[] = marks.map((item) => ({
    value: item.s,
    label: item.n,
    icon: item.l,
  }));

  const modelOptions: ComboOption[] = (mark?.m ?? []).map((item) => ({
    value: item.s,
    label: item.n,
  }));

  const generationOptions: ComboOption[] = (model?.g ?? []).map((item) => ({
    value: item.s,
    label: item.n,
    hint: item.y,
  }));

  const target =
    mark && model && generation
      ? generationUrl(mark.s, model.s, generation.s)
      : mark && model
        ? modelUrl(mark.s, model.s)
        : markHead
          ? markUrl(markHead.s)
          : "";

  return (
    <form
      onFocus={prefetchTree}
      onPointerEnter={prefetchTree}
      onSubmit={(event) => {
        event.preventDefault();
        if (target) router.push(target);
      }}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]"
    >
      <Combobox
        value={markSlug}
        onChange={(next) => {
          prefetchTree();
          setMarkSlug(next);
          // Модель и поколение принадлежат прежней марке — у новой их нет.
          setModelSlug("");
          setGenerationSlug("");
        }}
        options={markOptions}
        placeholder="Марка"
        emptyText="Такой марки в подборе пока нет"
      />

      <Combobox
        value={modelSlug}
        onChange={(next) => {
          setModelSlug(next);
          setGenerationSlug("");
        }}
        options={modelOptions}
        placeholder="Модель"
        disabled={!mark}
        emptyText="Такой модели у этой марки нет"
      />

      <Combobox
        value={generationSlug}
        onChange={setGenerationSlug}
        options={generationOptions}
        placeholder="Поколение"
        disabled={!model}
        emptyText="Поколение не найдено"
      />

      <button
        type="submit"
        disabled={!target}
        className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-50"
      >
        Подобрать
      </button>
    </form>
  );
}
