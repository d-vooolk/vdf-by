"use client";

import { useRef, useState } from "react";

import { ImagePlusIcon, SpinnerIcon } from "@/components/icons";

import { renderOne } from "./FrameTypeComposer";

const RETRY_DELAY = 10000;

export interface RenderAllType {
  type: string;
  productIds: string[];
}

interface Problem {
  type: string;
  productId: string;
  message: string;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function FrameTypesRenderAll({
  categoryId,
  types,
  missing,
}: {
  categoryId: string;
  types: RenderAllType[];
  missing: string[];
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState(0);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [finished, setFinished] = useState(false);
  const stopRef = useRef(false);
  const total = types.reduce((sum, item) => sum + item.productIds.length, 0);

  const renderWithRetry = async (type: string, productId: string) => {
    try {
      return await renderOne(categoryId, type, productId);
    } catch {
      await pause(RETRY_DELAY);
      return renderOne(categoryId, type, productId);
    }
  };

  const run = async () => {
    if (!window.confirm(`Перегенерировать картинки для ${total} товаров в ${types.length} типах?`)) return;
    stopRef.current = false;
    setRunning(true);
    setFinished(false);
    setProblems([]);
    setDone(0);
    let count = 0;
    for (const item of types) {
      for (const productId of item.productIds) {
        if (stopRef.current) break;
        count += 1;
        setProgress(`Тип ${item.type}: ${count} / ${total}`);
        try {
          const result = await renderWithRetry(item.type, productId);
          if (result.status === "skipped") {
            setProblems((list) => [...list, { type: item.type, productId, message: result.message ?? "пропущен" }]);
          } else {
            setDone((value) => value + 1);
          }
        } catch (problem) {
          setProblems((list) => [...list, { type: item.type, productId, message: (problem as Error).message }]);
        }
      }
      if (stopRef.current) break;
    }
    setRunning(false);
    setFinished(true);
    setProgress("");
  };

  return (
    <div className="card space-y-2 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} disabled={running || !total} className="btn-primary py-2 text-sm">
          {running ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <ImagePlusIcon className="h-4 w-4" />}
          Перегенерировать картинки всех типов ({total})
        </button>
        {running && (
          <button type="button" onClick={() => (stopRef.current = true)} className="btn-ghost py-2 text-sm">
            Остановить
          </button>
        )}
        {progress && <span className="tnum text-brand-500">{progress}</span>}
        {finished && (
          <span className="text-brand-600">
            Готово: {done}, пропущено или с ошибкой: {problems.length}
          </span>
        )}
      </div>
      <p className="text-xs text-brand-500">
        Берёт сохранённое фото рамки и оформление каждого типа и пересобирает первую картинку у всех его
        товаров по текущему шаблону. Вкладку не закрывайте до конца.
      </p>
      {missing.length > 0 && (
        <p className="text-xs text-amber-700">
          Без фото рамки или оформления, будут пропущены: {missing.join(", ")}
        </p>
      )}
      {problems.length > 0 && (
        <ul className="max-h-60 space-y-0.5 overflow-auto text-xs text-red-700">
          {problems.map((problem) => (
            <li key={`${problem.type}-${problem.productId}`}>
              <a href={`/admin/products/${problem.productId}/`} className="underline">
                {problem.type} · {problem.productId}
              </a>
              : {problem.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
