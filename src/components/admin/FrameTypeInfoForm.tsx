"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteFrameTypeAction, saveFrameTypeInfoAction } from "@/app/admin/actions";
import { AlertIcon, CheckIcon, TrashIcon } from "@/components/icons";
import { buildFrameSku, normalizeFrameSuffix, normalizeFrameType } from "@/lib/frame-sku";
import { specsFromText } from "@/lib/spec-text";

export interface FrameTypeInfoValues {
  type: string;
  suffix: string;
  name: string;
  storageCode: string;
  brief: string;
  specsText: string;
  titleTemplate: string;
}

const PLACEHOLDERS = "{марка} {модель} {кузов} {поколение} {годы} {тип} {название}";

export function FrameTypeInfoForm({
  categoryId,
  previousType,
  initial,
  sampleNumber,
  count,
  storageMixed = false,
}: {
  categoryId: string;
  previousType: string | null;
  initial: FrameTypeInfoValues;
  sampleNumber: string;
  count: number;
  storageMixed?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const type = normalizeFrameType(values.type);
  const suffix = normalizeFrameSuffix(values.suffix);
  const skuChanges = previousType !== null && (type !== initial.type || suffix !== initial.suffix);
  const listUrl = `/admin/frame-types/?category=${encodeURIComponent(categoryId)}`;

  const patch = (changes: Partial<FrameTypeInfoValues>) => {
    setValues((current) => ({ ...current, ...changes }));
    setDone(false);
  };

  const save = () =>
    startTransition(async () => {
      setProblems([]);
      const result = await saveFrameTypeInfoAction(categoryId, previousType, {
        ...values,
        specs: specsFromText(values.specsText),
      });
      if (!result.ok) {
        setProblems(result.problems);
        return;
      }
      setDone(true);
      if (result.type && result.type !== previousType) {
        router.replace(`/admin/frame-types/${result.type}/?category=${encodeURIComponent(categoryId)}`);
      } else {
        router.refresh();
      }
    });

  const remove = () =>
    startTransition(async () => {
      if (!previousType) return;
      const result = await deleteFrameTypeAction(categoryId, previousType);
      if (!result.ok) {
        setProblems(result.problems);
        return;
      }
      router.push(listUrl);
    });

  return (
    <div className="card space-y-4 p-5">
      <h2 className="font-semibold text-brand-900">Тип и артикул</h2>
      <div className="grid gap-4 sm:grid-cols-[10rem_12rem_minmax(0,1fr)_12rem]">
        <label className="block">
          <span className="label">Номер рамки</span>
          <input
            value={values.type}
            onChange={(event) => patch({ type: event.target.value })}
            maxLength={10}
            placeholder="110N"
            className="field tnum uppercase"
          />
        </label>
        <label className="block">
          <span className="label">Дополнение</span>
          <input
            value={values.suffix}
            onChange={(event) => patch({ suffix: event.target.value })}
            maxLength={30}
            placeholder="необязательно"
            className="field tnum uppercase"
          />
        </label>
        <label className="block">
          <span className="label">Название типа</span>
          <input
            value={values.name}
            onChange={(event) => patch({ name: event.target.value })}
            maxLength={200}
            placeholder="Переходная рамка Hella 3R"
            className="field"
          />
        </label>
        <label className="block">
          <span className="label">Складской номер</span>
          <input
            value={values.storageCode}
            onChange={(event) => patch({ storageCode: event.target.value })}
            maxLength={60}
            placeholder="А-12"
            className="field tnum"
          />
        </label>
      </div>
      <label className="block">
        <span className="label">Шаблон названия новых карточек</span>
        <input
          value={values.titleTemplate}
          onChange={(event) => patch({ titleTemplate: event.target.value })}
          maxLength={200}
          className="field"
        />
        <span className="mt-1 block text-xs text-brand-400">Подстановки: {PLACEHOLDERS}</span>
      </label>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="label">Описание для нейросети</span>
          <textarea
            value={values.brief}
            onChange={(event) => patch({ brief: event.target.value })}
            rows={6}
            maxLength={4000}
            placeholder="Под какие модули рамка, какие штатные линзы заменяет, что в комплекте, как ставится"
            className="field resize-y"
          />
          <span className="mt-1 block text-xs text-brand-400">
            Факты о рамке: по ним нейросеть пишет описание и вопросы-ответы каждой новой карточки.
            Чего здесь нет, она не выдумывает.
          </span>
        </label>
        <label className="block">
          <span className="label">Характеристики</span>
          <textarea
            value={values.specsText}
            onChange={(event) => patch({ specsText: event.target.value })}
            rows={6}
            placeholder={"Страна производитель: Россия\nВес: 0,1"}
            className="field tnum resize-y"
          />
          <span className="mt-1 block text-xs text-brand-400">
            По строке на характеристику, «название: значение». Копируются в новые карточки типа.
          </span>
        </label>
      </div>

      <p className="text-xs text-brand-400">
        Складской номер общий для типа: записывается во все его товары и виден только в админке.
        {storageMixed &&
          " Сейчас у товаров типа он разный — пока поле пустое, их номера не меняются."}
      </p>

      <p className="text-sm text-brand-600">
        Артикул товара:{" "}
        <span className="tnum font-semibold text-brand-900">
          {buildFrameSku({ number: sampleNumber, suffix, type: type || "…" })}
        </span>{" "}
        <span className="text-xs text-brand-400">— номер у каждого товара свой</span>
      </p>
      {skuChanges && count > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          Артикулы перепишутся у всех товаров типа ({count}). Прежний артикул VDF запоминается,
          поэтому загрузка цен с vdf-light.ru продолжит находить эти товары.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending || !type} className="btn-primary py-2 text-sm">
          {pending ? "Сохраняем…" : previousType ? "Сохранить тип" : "Создать тип"}
        </button>
        {done && (
          <span className="flex items-center gap-1.5 text-sm text-green-700">
            <CheckIcon className="h-4 w-4" />
            Сохранено
          </span>
        )}
        {previousType && count === 0 && (
          <button type="button" onClick={remove} disabled={pending} className="btn-ghost ml-auto py-2 text-sm text-red-700">
            <TrashIcon className="h-4 w-4" />
            Удалить тип
          </button>
        )}
      </div>

      {problems.length > 0 && (
        <p className="flex items-start gap-1.5 text-sm text-red-700" role="alert">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {problems.join(" ")}
        </p>
      )}
    </div>
  );
}
