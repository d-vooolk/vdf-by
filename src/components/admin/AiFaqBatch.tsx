"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { aiFillFaqAction } from "@/app/admin/actions";
import { SpinnerIcon } from "@/components/icons";
import { pluralize } from "@/lib/format";

export function AiFaqBatch({ total, ready }: { total: number; ready: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [left, setLeft] = useState(total);
  const [failed, setFailed] = useState<string[]>([]);
  const [error, setError] = useState("");
  const stop = useRef(false);

  if (!total && !done) return null;

  const run = async () => {
    setBusy(true);
    setError("");
    stop.current = false;
    let skip = [...failed];
    try {
      while (!stop.current) {
        const result = await aiFillFaqAction(skip);
        if (!result.ok) {
          setError(result.error);
          break;
        }
        skip = [...skip, ...result.failed];
        setFailed(skip);
        setDone((value) => value + result.done);
        setLeft(result.left);
        if (!result.left || (!result.done && result.failed.length === 0)) break;
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
      router.refresh();
    }
  };

  return (
    <div className="card flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1 text-sm text-brand-600">
        <p className="font-semibold text-brand-900">Вопросы-ответы нейросетью</p>
        <p className="mt-0.5 text-xs text-brand-400">
          Для каждого товара без блока «Вопросы и ответы» нейросеть напишет свой, по его
          названию, описанию и характеристикам. Сохраняется сразу, страница товара
          пересобирается сама.
        </p>
        {(done > 0 || failed.length > 0) && (
          <p className="mt-1 text-xs text-brand-500">
            Готово: {pluralize(done, "товар", "товара", "товаров")}
            {failed.length > 0 && `, не получилось: ${failed.length}`}
            {left > 0 && `, осталось: ${left}`}
          </p>
        )}
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      </div>
      {busy ? (
        <button type="button" onClick={() => (stop.current = true)} className="btn-secondary py-2 text-sm">
          <SpinnerIcon className="h-4 w-4 animate-spin" />
          Остановить
        </button>
      ) : (
        <button
          type="button"
          onClick={run}
          disabled={!ready || left === 0}
          className="btn-primary py-2 text-sm"
        >
          Заполнить {pluralize(left, "товар", "товара", "товаров")}
        </button>
      )}
    </div>
  );
}
