"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition } from "react";

import { setOrdersStatusAction } from "@/app/admin/order-actions";
import { SpinnerIcon } from "@/components/icons";
import { pluralize } from "@/lib/format";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/order-types";

interface OrderBulkState {
  selected: Set<number>;
  toggle: (id: number, on: boolean) => void;
}

const OrderBulkContext = createContext<OrderBulkState | null>(null);

export function OrderBulk({ ids, children }: { ids: number[]; children: React.ReactNode }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<OrderStatus>("done");
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const [knownIds, setKnownIds] = useState(ids);
  if (knownIds !== ids) {
    setKnownIds(ids);
    setSelected((current) => new Set(ids.filter((id) => current.has(id))));
  }

  const toggle = (id: number, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

  const apply = () =>
    startTransition(async () => {
      setProblems([]);
      const result = await setOrdersStatusAction([...selected], status);
      if (!result.ok) {
        setProblems(result.problems);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });

  return (
    <OrderBulkContext.Provider value={{ selected, toggle }}>
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <label className="flex items-center gap-2 text-sm text-brand-700">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => setSelected(event.target.checked ? new Set(ids) : new Set())}
            className="h-4 w-4 rounded border-brand-300 text-brand-700"
          />
          Выбрать все
        </label>
        <span className="tnum text-sm text-brand-400">
          {selected.size ? `выбрано ${pluralize(selected.size, "заказ", "заказа", "заказов")}` : "ничего не выбрано"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as OrderStatus)}
            disabled={pending}
            aria-label="Новый статус"
            className="field py-1.5 text-sm"
          >
            {ORDER_STATUSES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={apply}
            disabled={pending || selected.size === 0}
            className="btn-primary py-1.5 text-sm"
          >
            {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
            {status === "done" ? "Выполнить выбранные" : "Применить к выбранным"}
          </button>
        </div>
        {problems.length > 0 && <p className="basis-full text-sm text-red-700">{problems.join(" ")}</p>}
      </div>
      {children}
    </OrderBulkContext.Provider>
  );
}

export function OrderCheckbox({ id }: { id: number }) {
  const state = useContext(OrderBulkContext);
  if (!state) return null;
  return (
    <input
      type="checkbox"
      checked={state.selected.has(id)}
      onChange={(event) => state.toggle(id, event.target.checked)}
      aria-label={`Выбрать заказ №${id}`}
      className="h-4 w-4 shrink-0 rounded border-brand-300 text-brand-700"
    />
  );
}
