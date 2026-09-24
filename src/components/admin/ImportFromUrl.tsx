"use client";

import { useState } from "react";

import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons";
import type { FaqItem } from "@/lib/schema";

type Stage = "fetch" | "extract" | "rewrite" | "faq";

const STAGES: Array<{ key: Stage; label: string }> = [
  { key: "fetch", label: "Открываем страницу" },
  { key: "extract", label: "Находим описание и характеристики" },
  { key: "rewrite", label: "Переписываем описание" },
  { key: "faq", label: "Составляем вопросы-ответы" },
];

interface ImportEvent {
  stage?: Stage;
  title?: string;
  specs?: Array<{ name: string; value: string }>;
  text?: string;
  description?: string;
  faq?: FaqItem[];
  warning?: string;
  error?: string;
  done?: boolean;
}

export interface ImportTarget<Snapshot> {
  context: {
    categoryName?: string;
    brand?: string;
    options: string[];
    faq: FaqItem[];
  };
  snapshot: () => Snapshot;
  restore: (snapshot: Snapshot) => void;
  onTitle: (title: string) => void;
  onSpecs: (specs: Array<{ name: string; value: string }>) => void;
  onDescription: (description: string) => void;
  onFaq: (items: FaqItem[]) => void;
}

export function ImportFromUrl<Snapshot>({
  ready,
  target,
}: {
  ready: boolean;
  target: ImportTarget<Snapshot>;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [backup, setBackup] = useState<Snapshot | null>(null);

  const run = async () => {
    const before = target.snapshot();
    setBusy(true);
    setFinished(false);
    setError("");
    setWarning("");
    setStage(null);
    setBackup(before);

    let draft = "";
    let completed = false;
    try {
      const response = await fetch("/admin/api/ai/import/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, ...target.context }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Сервер ответил ${response.status}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ImportEvent;
          if (event.stage) setStage(event.stage);
          if (event.title) target.onTitle(event.title);
          if (event.specs) target.onSpecs(event.specs);
          if (event.text) {
            draft += event.text;
            target.onDescription(draft);
          }
          if (event.description !== undefined) target.onDescription(event.description);
          if (event.faq) target.onFaq(event.faq);
          if (event.warning) setWarning(event.warning);
          if (event.error) setError(event.error);
          if (event.done) completed = true;
        }
      }
      if (completed) setFinished(true);
      else setError((current) => current || "Генерация оборвалась — попробуйте ещё раз");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reached = (key: Stage) => {
    if (finished) return "done";
    const current = STAGES.findIndex((item) => item.key === stage);
    const index = STAGES.findIndex((item) => item.key === key);
    if (current < 0 || index > current) return "waiting";
    if (index < current) return "done";
    return error ? "failed" : "active";
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && url.trim() && !busy && ready) {
              event.preventDefault();
              void run();
            }
          }}
          placeholder="https://vdf-light.ru/product/G28-BIG-24R"
          className="field flex-1"
          disabled={busy}
        />
        <button
          type="button"
          onClick={run}
          disabled={busy || !ready || !url.trim()}
          className="btn-secondary shrink-0 py-2 text-sm"
        >
          {busy ? (
            <>
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Генерируем…
            </>
          ) : (
            "Сгенерировать по ссылке"
          )}
        </button>
      </div>

      {!ready && (
        <p className="text-xs text-brand-400">
          Заработает, когда в .env на сервере появится AI_API_KEY.
        </p>
      )}

      {(busy || stage) && (
        <ol className="space-y-1 text-sm">
          {STAGES.map((item) => {
            const state = reached(item.key);
            return (
              <li
                key={item.key}
                className={`flex items-center gap-2 ${
                  state === "waiting"
                    ? "text-brand-300"
                    : state === "failed"
                      ? "text-red-700"
                      : state === "done"
                        ? "text-green-700"
                        : "text-brand-900"
                }`}
              >
                {state === "active" && busy ? (
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                ) : state === "done" ? (
                  <CheckIcon className="h-4 w-4" />
                ) : state === "failed" ? (
                  <AlertIcon className="h-4 w-4" />
                ) : (
                  <span className="inline-block h-4 w-4" />
                )}
                {item.label}
              </li>
            );
          })}
        </ol>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-red-700" role="alert">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {warning && !error && (
        <p className="flex items-start gap-1.5 text-sm text-amber-700">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {warning}
        </p>
      )}

      {backup !== null && !busy && (stage || error) && (
        <button
          type="button"
          onClick={() => {
            target.restore(backup);
            setBackup(null);
            setStage(null);
            setFinished(false);
            setError("");
            setWarning("");
          }}
          className="btn-ghost py-1.5 text-sm"
        >
          Вернуть как было
        </button>
      )}
    </div>
  );
}
