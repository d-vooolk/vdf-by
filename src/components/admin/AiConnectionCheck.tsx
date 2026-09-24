"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { checkAiConnectionAction, type AiCheckResult } from "@/app/admin/actions";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} с`;

export function AiConnectionCheck({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiCheckResult | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await checkAiConnectionAction());
      router.refresh();
    } catch (error) {
      setResult({ ok: false, error: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={busy || disabled}
        className="btn-secondary py-2 text-sm"
      >
        {busy ? (
          <>
            <SpinnerIcon className="h-4 w-4 animate-spin" />
            Проверяем…
          </>
        ) : (
          "Проверить соединение"
        )}
      </button>

      {result?.ok && (
        <p className="flex items-start gap-1.5 text-sm text-green-700">
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Ответ «{result.answer}» за {seconds(result.durationMs)} от {result.model}
            {result.provider && ` (${result.provider})`}
            {result.cost !== null && `, стоимость $${result.cost.toFixed(6)}`}
          </span>
        </p>
      )}
      {result && !result.ok && (
        <p className="flex items-start gap-1.5 text-sm text-red-700" role="alert">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {result.error}
        </p>
      )}
    </div>
  );
}
