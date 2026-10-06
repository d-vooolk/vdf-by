"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteCustomerAction,
  setCustomerNoteAction,
  setCustomerStaffAction,
  setWholesaleStatusAction,
} from "@/app/admin/actions";

export function CustomerControls({
  id,
  status,
  note: initialNote,
  staff,
}: {
  id: number;
  status: "none" | "pending" | "approved" | "rejected";
  note: string;
  staff: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(initialNote);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState("");

  const run = (task: () => Promise<{ ok: boolean; problems: string[] } | void>) =>
    startTransition(async () => {
      const result = await task();
      setProblem(result && !result.ok ? result.problems.join("; ") : "");
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!staff && status !== "approved" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setWholesaleStatusAction(id, "approved"))}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            Подтвердить опт
          </button>
        )}
        {!staff && status === "pending" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setWholesaleStatusAction(id, "rejected"))}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Отклонить
          </button>
        )}
        {!staff && status === "approved" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setWholesaleStatusAction(id, "none"))}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Снять опт
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setCustomerStaffAction(id, !staff))}
          className={`${staff ? "btn-secondary" : "btn-ghost"} px-3 py-1.5 text-xs`}
        >
          {staff
            ? "Снять роль сотрудника"
            : status === "approved" || status === "pending"
              ? "Сделать сотрудником (опт снимется)"
              : "Сделать сотрудником"}
        </button>
        {confirmDelete ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteCustomerAction(id))}
              className="btn-secondary px-3 py-1.5 text-xs text-red-700"
            >
              Да, удалить кабинет
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              Отмена
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="btn-ghost px-3 py-1.5 text-xs text-brand-400"
          >
            Удалить
          </button>
        )}
      </div>
      {problem && (
        <p role="alert" className="text-xs text-red-700">
          {problem}
        </p>
      )}
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onBlur={() => {
          if (note !== initialNote) run(() => setCustomerNoteAction(id, note));
        }}
        rows={2}
        placeholder="Заметка: о чём договорились по телефону"
        className="field w-full py-1.5 text-xs"
      />
    </div>
  );
}
