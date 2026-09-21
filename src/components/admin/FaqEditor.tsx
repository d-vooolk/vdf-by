"use client";

import { TrashIcon } from "@/components/icons";
import type { FaqItem } from "@/lib/schema";

export function cleanFaq(items: FaqItem[] | undefined): FaqItem[] | undefined {
  const filled = (items ?? [])
    .map((item) => ({ q: item.q.trim(), a: item.a.trim() }))
    .filter((item) => item.q && item.a);

  return filled.length ? filled : undefined;
}

export function FaqEditor({
  value,
  onChange,
}: {
  value: FaqItem[];
  onChange: (value: FaqItem[]) => void;
}) {
  const update = (index: number, patch: Partial<FaqItem>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <div className="space-y-3">
      {value.map((item, index) => (
        <div
          key={index}
          className="rounded-xl border border-brand-100 bg-brand-50/50 p-3"
        >
          <div className="flex gap-2">
            <input
              value={item.q}
              onChange={(event) => update(index, { q: event.target.value })}
              placeholder="Встанет ли стекло от рестайлинга на дорестайлинг?"
              className="field flex-1 py-2 text-sm font-medium"
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              title="Убрать вопрос"
              className="btn-ghost px-2 py-2 text-red-700"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>

          <textarea
            value={item.a}
            onChange={(event) => update(index, { a: event.target.value })}
            placeholder="Нет, не встанет: посадочные места и крепления у рестайлинга свои."
            rows={2}
            className="field mt-2 resize-y py-2 text-sm"
          />
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, { q: "", a: "" }])}
        className="btn-secondary py-2 text-sm"
      >
        + Вопрос
      </button>
    </div>
  );
}
