"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { applyFrameTypeAction } from "@/app/admin/actions";
import { NumberInput } from "@/components/admin/form-parts";
import { MoneyField } from "@/components/admin/MoneyField";
import { AlertIcon, CheckIcon } from "@/components/icons";
import type { FrameTypeValues } from "@/lib/frame-types";

export function FrameTypeForm({
  categoryId,
  type,
  initial,
  count,
  currencySymbol,
}: {
  categoryId: string;
  type: string;
  initial: FrameTypeValues;
  count: number;
  currencySymbol: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState<number | null>(null);

  const patch = (changes: Partial<FrameTypeValues>) => {
    setValues((current) => ({ ...current, ...changes }));
    setDone(null);
  };

  const apply = () =>
    startTransition(async () => {
      setProblems([]);
      const result = await applyFrameTypeAction(categoryId, type, values);
      if (!result.ok) {
        setProblems(result.problems);
        return;
      }
      setDone(result.updated ?? 0);
      router.refresh();
    });

  return (
    <div className="card space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyField
          label="Себестоимость"
          value={values.costPrice}
          source={values.costSource}
          rounding="kopeck"
          currencySymbol={currencySymbol}
          onChange={(costPrice, costSource) => patch({ costPrice, costSource })}
        />
        <MoneyField
          label="Цена розницы"
          value={values.price}
          source={values.priceSource}
          rounding="ruble"
          currencySymbol={currencySymbol}
          onChange={(price, priceSource) => patch({ price, priceSource })}
        />
        <MoneyField
          label="Оптовая цена"
          value={values.wholesalePrice}
          source={values.wholesaleSource}
          rounding="ruble"
          currencySymbol={currencySymbol}
          onChange={(wholesalePrice, wholesaleSource) => patch({ wholesalePrice, wholesaleSource })}
        />
        <label className="block">
          <span className="label">Остаток на складе, шт.</span>
          <NumberInput
            value={values.stockQty}
            onChange={(stockQty) => patch({ stockQty })}
            placeholder="не ведётся"
            integer
          />
        </label>
      </div>

      <p className="text-xs text-brand-400">
        Остаток общий для типа: рамка одна и та же на все машины, поэтому у каждого товара будет
        записано одно и то же число. Наличие считается по остатку: больше нуля — в наличии,
        пусто или ноль — нет в наличии. Пустая цена — на сайте «Цену уточняйте».
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={apply}
          disabled={pending || count === 0}
          className="btn-primary py-2 text-sm"
        >
          {pending ? "Применяем…" : `Применить ко всем товарам типа ${type} (${count})`}
        </button>
        {done !== null && (
          <span className="flex items-center gap-1.5 text-sm text-green-700">
            <CheckIcon className="h-4 w-4" />
            Обновлено товаров: {done}
          </span>
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
