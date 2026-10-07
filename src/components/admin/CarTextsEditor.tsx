"use client";

import { useState, useTransition } from "react";

import { saveCarTextAction } from "@/app/admin/actions";
import { SpinnerIcon } from "@/components/icons";

export interface CarTextEntry {
  modelId: string;
  name: string;
  url: string;
  productCount: number;
  text: string;
}

interface CarTextsEditorProps {
  categoryId: string;
  entries: CarTextEntry[];
}

export function CarTextsEditor({ categoryId, entries }: CarTextsEditorProps) {
  const filled = entries.filter((entry) => entry.text).length;

  return (
    <div className="space-y-2">
      <p className="text-xs text-brand-400">
        С текстом {filled} из {entries.length}
      </p>
      {entries.map((entry) => (
        <CarTextRow key={entry.modelId} categoryId={categoryId} entry={entry} />
      ))}
    </div>
  );
}

function CarTextRow({ categoryId, entry }: { categoryId: string; entry: CarTextEntry }) {
  const [saved, setSaved] = useState(entry.text);
  const [draft, setDraft] = useState(entry.text);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const changed = draft.trim() !== saved.trim();

  const save = () =>
    startTransition(async () => {
      const result = await saveCarTextAction(categoryId, entry.modelId, draft);
      setProblems(result.problems);
      if (result.ok) setSaved(draft);
    });

  return (
    <details className="rounded-card border border-brand-100">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
        <span className="font-medium text-brand-900">{entry.name}</span>
        <span className="text-xs text-brand-400">{entry.productCount} привяз.</span>
        <span className={`ml-auto text-xs ${saved ? "text-green-700" : "text-brand-400"}`}>
          {saved ? `${saved.length} знаков` : "нет текста"}
          {changed && " · не сохранено"}
        </span>
      </summary>
      <div className="space-y-3 border-t border-brand-100 p-4">
        <a href={entry.url} target="_blank" rel="noopener" className="font-mono text-xs text-brand-500 hover:underline">
          {entry.url}
        </a>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={8}
          className="field resize-y text-sm"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending || !changed}
            className="btn-secondary py-2 text-sm"
          >
            {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
            Сохранить текст
          </button>
          {problems.map((problem) => (
            <span key={problem} className="text-xs text-red-700">
              {problem}
            </span>
          ))}
        </div>
      </div>
    </details>
  );
}
