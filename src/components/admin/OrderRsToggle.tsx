"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setOrderRsAction } from "@/app/admin/order-actions";
import { SpinnerIcon } from "@/components/icons";

const pad = (value: number) => String(value).padStart(2, "0");

function dateInput(timestamp: number = Date.now()): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function OrderRsToggle({ orderId, rsAt }: { orderId: number; rsAt: number | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState(rsAt !== null);
  const [date, setDate] = useState(() => dateInput(rsAt ?? Date.now()));
  const [problem, setProblem] = useState("");

  const save = (nextChecked: boolean, nextDate: string) => {
    const previous = { checked, date };
    setChecked(nextChecked);
    setDate(nextDate);
    setProblem("");
    startTransition(async () => {
      const result = await setOrderRsAction(orderId, nextChecked ? nextDate : null);
      if (!result.ok) {
        setChecked(previous.checked);
        setDate(previous.date);
        setProblem(result.problems.join("; "));
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="card p-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-brand-900">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(event) => save(event.target.checked, dateInput())}
          className="h-4 w-4 accent-brand-700"
        />
        Оплата по РС
        {pending && <SpinnerIcon className="h-4 w-4 animate-spin text-brand-400" />}
      </label>
      {checked ? (
        <label className="mt-3 block">
          <span className="label">Дата поступления</span>
          <input
            type="date"
            value={date}
            max={dateInput()}
            disabled={pending}
            onChange={(event) => event.target.value && save(true, event.target.value)}
            className="field"
          />
          <span className="mt-1 block text-xs text-brand-400">
            Сумма заказа попадает в «Бухгалтерия → Приход РС» за месяц этой даты
          </span>
        </label>
      ) : (
        <p className="mt-1 text-xs text-brand-400">Отметьте, когда оплата по заказу пришла на расчётный счёт</p>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {problem}
        </p>
      )}
    </section>
  );
}
