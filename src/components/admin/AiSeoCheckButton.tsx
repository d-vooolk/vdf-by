"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { startAiSeoCheckAction } from "@/app/admin/seo-actions";
import { SpinnerIcon } from "@/components/icons";

const POLL_MS = 10000;

export function AiSeoCheckButton({ running }: { running: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, router]);

  const busy = running || pending;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          startTransition(async () => {
            const result = await startAiSeoCheckAction();
            setError(result.ok ? "" : result.error);
            router.refresh();
          })
        }
        className="btn-secondary py-1.5 text-xs disabled:opacity-60"
      >
        {busy && <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />}
        {running ? "Проверяем ответы…" : "Проверить ответы нейросетей"}
      </button>
      {error && (
        <span className="text-xs text-red-700" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
