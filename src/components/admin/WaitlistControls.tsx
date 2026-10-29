"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteWaitlistAction,
  setWaitlistNoteAction,
  setWaitlistStatusAction,
} from "@/app/admin/waitlist-actions";
import type { WaitlistStatus } from "@/lib/waitlist";

export function WaitlistControls({ id, status, note }: { id: number; status: WaitlistStatus; note: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(note);

  const run = (action: () => Promise<unknown>) =>
    startTransition(async () => {
      await action();
      router.refresh();
    });

  return (
    <div className="flex w-full flex-col gap-2 sm:w-64">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => draft !== note && run(() => setWaitlistNoteAction(id, draft))}
        placeholder="Заметка"
        className="field py-1.5 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        {status === "waiting" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setWaitlistStatusAction(id, "notified"))}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            Сообщили
          </button>
        )}
        {status !== "done" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setWaitlistStatusAction(id, "done"))}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Закрыть
          </button>
        )}
        {status !== "waiting" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setWaitlistStatusAction(id, "waiting"))}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            Вернуть в ожидание
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Удалить запись из листа ожидания?")) run(() => deleteWaitlistAction(id));
          }}
          className="btn-ghost px-3 py-1.5 text-xs text-red-700"
        >
          Удалить
        </button>
      </div>
    </div>
  );
}
