"use client";

import { TrashIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import type { Spec } from "@/lib/schema";

const MARGIN_TEXT = {
  retail: {
    empty: "Заполните себестоимость и цену розницы — рядом посчитается прибыль и маржа.",
    title: "с розницы",
    note: "Разница между ценой розницы и себестоимостью.",
    optionsNote: "Считается от базовой цены розницы. У опций свои цены — там маржа другая.",
  },
  wholesale: {
    empty: "Заполните себестоимость и оптовую цену — рядом посчитается прибыль с опта.",
    title: "с опта",
    note: "Разница между оптовой ценой и себестоимостью.",
    optionsNote: "Считается от базовой оптовой цены. У опций свой опт — там маржа другая.",
  },
} as const;

export function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <p className="field tnum bg-brand-50 text-brand-600">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Характеристики                                                      */
/* ------------------------------------------------------------------ */

export function SpecsEditor({
  value,
  onChange,
}: {
  value: Spec[];
  onChange: (value: Spec[]) => void;
}) {
  const update = (index: number, patch: Partial<Spec>) =>
    onChange(value.map((spec, i) => (i === index ? { ...spec, ...patch } : spec)));

  return (
    <div className="space-y-2">
      {value.map((spec, index) => (
        <div key={index} className="flex gap-2">
          <input
            value={spec.name}
            onChange={(event) => update(index, { name: event.target.value })}
            placeholder="Мощность"
            className="field w-1/3 py-2 text-sm"
          />
          <input
            value={spec.value}
            onChange={(event) => update(index, { value: event.target.value })}
            placeholder="55 Вт"
            className="field flex-1 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            title="Убрать строку"
            className="btn-ghost px-2 py-2 text-red-700"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, { name: "", value: "" }])}
        className="btn-secondary py-2 text-sm"
      >
        + Строка характеристики
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function formatPercent(value: number): string {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

export function Margin({
  kind,
  price,
  cost,
  currencySymbol,
  hasOptions,
}: {
  kind: keyof typeof MARGIN_TEXT;
  price: number;
  cost: number | null;
  currencySymbol: string;
  hasOptions: boolean;
}) {
  const text = MARGIN_TEXT[kind];
  if (cost === null || price <= 0) {
    return (
      <p className="flex h-full items-center text-xs text-brand-400">{text.empty}</p>
    );
  }

  const profit = price - cost;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const markup = cost > 0 ? (profit / cost) * 100 : null;
  const good = profit > 0;

  return (
    <div
      className={`flex h-full flex-col justify-center rounded-xl border px-4 py-3 ${
        good
          ? "border-green-200 bg-green-50 text-green-900"
          : "border-red-200 bg-red-50 text-red-900"
      }`}
    >
      <p className="text-sm font-semibold">
        {good ? "Прибыль" : "Убыток"} {text.title} {formatPrice(Math.abs(profit), currencySymbol)}
        <span className="ml-2 font-normal opacity-80">
          маржа {formatPercent(margin)}
          {markup !== null && ` · наценка ${formatPercent(markup)}`}
        </span>
      </p>
      <p className="mt-1 text-xs opacity-70">{hasOptions ? text.optionsNote : text.note}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-brand-200 text-brand-700 focus:ring-brand-600"
      />
      <span>
        <span className="block text-sm font-medium text-brand-900">{label}</span>
        {hint && <span className="block text-xs text-brand-400">{hint}</span>}
      </span>
    </label>
  );
}
