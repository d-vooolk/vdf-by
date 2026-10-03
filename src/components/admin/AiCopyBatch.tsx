"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { SpinnerIcon } from "@/components/icons";
import { pluralize } from "@/lib/format";

interface CopyEvent {
  product?: { id: string; title: string };
  saved?: { id: string; score: number; reviews: number };
  failed?: string;
  error?: string;
  left?: number;
}

export function AiCopyBatch({
  left: initialLeft,
  total,
  ready,
  targetScore,
}: {
  left: number;
  total: number;
  ready: boolean;
  targetScore: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(initialLeft);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState("");
  const stop = useRef(false);
  const title = useRef("");

  const handle = (event: CopyEvent, skip: string[]) => {
    if (event.left !== undefined) setLeft(event.left);
    if (event.product) {
      title.current = event.product.title;
      setCurrent(event.product.title);
    }
    if (event.saved) {
      const { score, reviews } = event.saved;
      setDone((value) => value + 1);
      setLog((lines) =>
        [`${title.current || event.saved?.id}: оценка ${score}, проверок ${reviews}`, ...lines].slice(0, 8),
      );
    }
    if (event.failed) {
      skip.push(event.failed);
      setFailed([...skip]);
      setLog((lines) => [`${event.failed}: ${event.error ?? "ошибка"}`, ...lines].slice(0, 8));
    }
  };

  const run = async () => {
    setBusy(true);
    setError("");
    stop.current = false;
    const skip = [...failed];
    try {
      while (!stop.current) {
        const response = await fetch("/admin/api/ai/copy/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skip }),
        });
        if (!response.ok || !response.body) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? `Сервер ответил ${response.status}`);
          break;
        }
        if (response.headers.get("Content-Type")?.includes("application/json")) {
          handle((await response.json()) as CopyEvent, skip);
          break;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        let finished = false;
        for (;;) {
          const { done: ended, value } = await reader.read();
          if (ended) break;
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as CopyEvent;
            handle(event, skip);
            if (event.saved || event.failed) finished = true;
          }
        }
        if (!finished) {
          setError("Соединение оборвалось — нажмите ещё раз, продолжится с того же места");
          break;
        }
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
      setCurrent("");
      router.refresh();
    }
  };

  return (
    <div className="card flex flex-wrap items-start gap-3 p-4">
      <div className="min-w-0 flex-1 text-sm text-brand-600">
        <p className="font-semibold text-brand-900">Описания товаров по новому стандарту</p>
        <p className="mt-0.5 text-xs text-brand-400">
          Нейросеть пишет описание, затем SEO-редактор оценивает его и исправляет, пока оценка не
          дойдёт до {targetScore} или не пройдёт три проверки. Сначала идут товары с самым коротким
          описанием. Сохраняется сразу. Переписано {total - left} из {total}.
        </p>
        {(done > 0 || failed.length > 0) && (
          <p className="mt-1 text-xs text-brand-500">
            За этот запуск: {pluralize(done, "товар", "товара", "товаров")}
            {failed.length > 0 && `, не получилось: ${failed.length}`}
          </p>
        )}
        {current && <p className="mt-1 truncate text-xs text-brand-500">Сейчас: {current}</p>}
        {log.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs text-brand-400">
            {log.map((entry, index) => (
              <li key={index} className="truncate">
                {entry}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      </div>
      {busy ? (
        <button type="button" onClick={() => (stop.current = true)} className="btn-secondary py-2 text-sm">
          <SpinnerIcon className="h-4 w-4 animate-spin" />
          Остановить после текущего
        </button>
      ) : (
        <button
          type="button"
          onClick={run}
          disabled={!ready || left === 0}
          className="btn-primary py-2 text-sm"
        >
          Переписать {pluralize(left, "товар", "товара", "товаров")}
        </button>
      )}
    </div>
  );
}
