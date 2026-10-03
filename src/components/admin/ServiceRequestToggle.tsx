"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setServiceRequestDoneAction } from "@/app/admin/actions";

export function ServiceRequestToggle({ id, done }: { id: number; done: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setServiceRequestDoneAction(id, !done);
          router.refresh();
        })
      }
      className={`${done ? "btn-ghost" : "btn-primary"} shrink-0 px-3 py-1.5 text-xs`}
    >
      {done ? "Вернуть в работу" : "Обработана"}
    </button>
  );
}
