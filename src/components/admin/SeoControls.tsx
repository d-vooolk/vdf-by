"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { refreshSeoAction, saveCompetitorsAction } from "@/app/admin/seo-actions";
import { SpinnerIcon } from "@/components/icons";
import type { SeoKind } from "@/lib/seo-data";

const POLL_MS = 10000;

export function SeoRefreshButton({ kind, running, label }: { kind: SeoKind; running: boolean; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, router]);

  const busy = running || pending;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => startTransition(() => refreshSeoAction(kind))}
      className="btn-secondary py-1.5 text-xs disabled:opacity-60"
    >
      {busy && <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />}
      {running ? "Собираем данные…" : label}
    </button>
  );
}

export function CompetitorsEditor({ initial }: { initial: string[] }) {
  const [text, setText] = useState(initial.join("\n"));
  const [saved, setSaved] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <details className="border-t border-brand-100">
      <summary className="cursor-pointer px-4 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">
        Список конкурентов ({initial.length})
      </summary>
      <form
        className="space-y-2 px-4 pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await saveCompetitorsAction(text);
            setSaved(`Сохранено сайтов: ${result.count}. Новые появятся в таблице после следующего сбора.`);
          });
        }}
      >
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSaved("");
          }}
          rows={8}
          className="field font-mono text-xs"
          aria-label="Домены конкурентов, по одному в строке"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary py-1.5 text-xs">
            {pending && <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />}
            Сохранить список
          </button>
          {saved && <span className="text-xs text-green-700">{saved}</span>}
        </div>
      </form>
    </details>
  );
}
