"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { refreshRatesAction } from "@/app/admin/actions";
import { SpinnerIcon } from "@/components/icons";

export function RatesRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError("");
            const result = await refreshRatesAction();
            if (!result.ok) setError(result.problems.join(" "));
            router.refresh();
          })
        }
        className="btn-secondary py-2 text-sm"
      >
        {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
        Пересчитать по курсу сейчас
      </button>
      {error && (
        <span className="text-sm text-red-700" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
