"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveFrameTypePricesAction, type FrameTypePriceField } from "@/app/admin/frame-type-actions";
import { CheckIcon } from "@/components/icons";
import { FOREIGN_CURRENCIES, type MoneySource } from "@/lib/currency";
import type { FrameTypeValues } from "@/lib/frame-types";

const FIELDS: Array<{ field: FrameTypePriceField; source: keyof FrameTypeValues; label: string; title: string }> = [
  { field: "costPrice", source: "costSource", label: "себест.", title: "Себестоимость — только для вас" },
  { field: "price", source: "priceSource", label: "розница", title: "Цена розницы. Пусто — «Цену уточняйте»" },
  { field: "wholesalePrice", source: "wholesaleSource", label: "опт", title: "Оптовая цена — видят подтверждённые оптовики" },
];

function storedText(values: FrameTypeValues | null, field: FrameTypePriceField, source: MoneySource | null): string {
  const amount = source ? source.amount : values?.[field];
  return amount === null || amount === undefined ? "" : String(amount);
}

function parseAmount(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function FrameTypePriceFields({
  categoryId,
  type,
  values,
  currencySymbol,
}: {
  categoryId: string;
  type: string;
  values: FrameTypeValues | null;
  currencySymbol: string;
}) {
  const router = useRouter();
  const [texts, setTexts] = useState<Partial<Record<FrameTypePriceField, string>>>({});
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const [known, setKnown] = useState(values);
  if (values !== known) {
    setKnown(values);
    setTexts({});
  }

  const entries = FIELDS.map((entry) => {
    const source = (values?.[entry.source] ?? null) as MoneySource | null;
    const stored = storedText(values, entry.field, source);
    const text = texts[entry.field] ?? stored;
    return { ...entry, source, stored, text, amount: parseAmount(text) };
  });
  const invalid = entries.filter((entry) => entry.amount === undefined);
  const changes: Partial<Record<FrameTypePriceField, number | null>> = {};
  for (const entry of entries) {
    if (entry.amount === undefined || entry.amount === parseAmount(entry.stored)) continue;
    changes[entry.field] = entry.amount;
  }
  const changed = Object.keys(changes).length > 0;

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invalid.length) {
      setProblem(`Проверьте: ${invalid.map((entry) => entry.label).join(", ")}`);
      return;
    }
    if (pending || !changed) return;
    startTransition(async () => {
      setProblem("");
      const result = await saveFrameTypePricesAction(categoryId, type, changes);
      if (!result.ok) {
        setProblem(result.problems.join(" "));
        return;
      }
      setDone(true);
      router.refresh();
    });
  };

  return (
    <form onSubmit={save} className={`flex flex-wrap items-end gap-2 ${pending ? "opacity-60" : ""}`}>
      {entries.map((entry) => (
        <label
          key={entry.field}
          className="block"
          title={
            entry.source
              ? `${entry.title}. Сумма в ${FOREIGN_CURRENCIES[entry.source.currency]}, пересчитывается по курсу каждый день`
              : entry.title
          }
        >
          <span className="block text-[10px] leading-tight text-brand-400">{entry.label}</span>
          <span className="relative block">
            <input
              type="text"
              inputMode="decimal"
              value={entry.text}
              placeholder="—"
              onChange={(event) => {
                setTexts((current) => ({ ...current, [entry.field]: event.target.value }));
                setDone(false);
              }}
              aria-invalid={entry.amount === undefined || undefined}
              className="field tnum w-24 py-1.5 pr-8 text-right text-sm aria-invalid:border-red-400"
            />
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-brand-300">
              {entry.source ? FOREIGN_CURRENCIES[entry.source.currency] : currencySymbol}
            </span>
          </span>
        </label>
      ))}
      <button
        type="submit"
        disabled={(!changed && !invalid.length) || pending}
        title="Сохранить цены для всех товаров типа"
        aria-label={`Сохранить цены типа ${type}`}
        className="btn-primary px-2 py-1.5 disabled:opacity-30"
      >
        <CheckIcon className="h-4 w-4" />
      </button>
      {done && !changed && <CheckIcon className="mb-2 h-4 w-4 text-green-700" />}
      {problem && <span className="basis-full text-xs text-red-700">{problem}</span>}
    </form>
  );
}
