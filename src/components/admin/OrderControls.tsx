"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteOrderAction,
  setOrderNoteAction,
  setOrderStatusAction,
} from "@/app/admin/actions";
import { Problems } from "@/components/admin/form-parts";
import { SpinnerIcon, TrashIcon } from "@/components/icons";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/order-types";

/**
 * Работа с заказом: статус и заметка менеджера.
 *
 * Статус переключается сразу по нажатию, без кнопки «Сохранить»: это самое
 * частое действие в админке, и лишний шаг здесь стоил бы дороже всего.
 */

interface OrderControlsProps {
  id: number;
  status: OrderStatus;
  note: string;
}

export function OrderControls({ id, status: initial, note: initialNote }: OrderControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<OrderStatus>(initial);
  const [note, setNote] = useState(initialNote);
  const [noteSaved, setNoteSaved] = useState(true);
  const [problems, setProblems] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const changeStatus = (next: OrderStatus) => {
    const previous = status;
    setStatus(next);
    setProblems([]);

    startTransition(async () => {
      const result = await setOrderStatusAction(id, next);
      if (!result.ok) {
        setStatus(previous);
        setProblems(result.problems);
        return;
      }
      // Счётчик новых заказов стоит в шапке — обновляем её тоже.
      router.refresh();
    });
  };

  const saveNote = () => {
    startTransition(async () => {
      const result = await setOrderNoteAction(id, note);
      if (result.ok) setNoteSaved(true);
      else setProblems(result.problems);
    });
  };

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-bold text-brand-900">Обработка</h2>

      <Problems items={problems} />

      <p className="mb-2 text-xs text-brand-400">
        «Выполнен» списывает заказанное количество с остатков на складе. Если потом сменить
        статус, списанное вернётся на склад.
      </p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {ORDER_STATUSES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => changeStatus(entry.id)}
            disabled={pending}
            aria-pressed={status === entry.id}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
              status === entry.id
                ? "bg-brand-700 text-white"
                : "bg-brand-50 text-brand-600 hover:bg-brand-100"
            }`}
          >
            {entry.name}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="label">Заметка</span>
        <textarea
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setNoteSaved(false);
          }}
          onBlur={() => !noteSaved && saveNote()}
          rows={4}
          placeholder="Перезвонить после 18:00, уточнить цоколь"
          className="field resize-y py-2 text-sm"
        />
      </label>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={saveNote}
          disabled={pending || noteSaved}
          className="btn-secondary py-1.5 text-sm"
        >
          {pending ? (
            <>
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Сохраняем…
            </>
          ) : noteSaved ? (
            "Заметка сохранена"
          ) : (
            "Сохранить заметку"
          )}
        </button>
      </div>

      <div className="mt-4 border-t border-brand-100 pt-3">
        {confirmDelete ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteOrderAction(id);
                  if (result && !result.ok) setProblems(result.problems);
                })
              }
              disabled={pending}
              className="btn-primary bg-red-700 py-1.5 text-sm hover:bg-red-800"
            >
              Да, удалить заказ
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="btn-ghost py-1.5 text-sm"
            >
              Отмена
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="btn-ghost py-1.5 text-xs text-red-700 hover:bg-red-50"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Удалить заказ
          </button>
        )}
        <p className="mt-2 text-xs text-brand-300">
          Отменённый заказ лучше пометить статусом «Отменён» — так останется
          история. Удаление стирает его насовсем.
        </p>
      </div>
    </section>
  );
}
