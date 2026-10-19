"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setFrameTypeStorageCodeAction } from "@/app/admin/frame-type-actions";
import { PrintLabelButton } from "@/components/admin/PrintLabelButton";
import { CheckIcon } from "@/components/icons";

export function FrameTypeStorageField({
  categoryId,
  type,
  initial,
  mixed,
}: {
  categoryId: string;
  type: string;
  initial: string;
  mixed: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [problem, setProblem] = useState("");
  const [pending, startTransition] = useTransition();
  const changed = value.trim() !== saved;

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !changed) return;
    const next = value.trim();
    startTransition(async () => {
      setProblem("");
      const result = await setFrameTypeStorageCodeAction(categoryId, type, next);
      if (!result.ok) {
        setProblem(result.problems.join(" "));
        return;
      }
      setSaved(next);
      setValue(next);
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={save}
      className={`flex w-56 items-center gap-1 ${pending ? "opacity-60" : ""}`}
      title={problem || "Складской номер — входит в артикул товаров типа"}
    >
      <label className="flex min-w-0 items-center gap-1.5 text-xs text-brand-500">
        склад
        <input
          type="text"
          value={value}
          maxLength={60}
          placeholder={mixed ? "разный" : "—"}
          onChange={(event) => {
            setValue(event.target.value);
            setProblem("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setValue(saved);
          }}
          aria-invalid={Boolean(problem) || undefined}
          aria-label={`Складской номер типа ${type}`}
          className="field tnum w-20 py-1 text-sm aria-invalid:border-red-400"
        />
      </label>
      <button
        type="submit"
        disabled={pending || !changed}
        title="Сохранить складской номер"
        aria-label="Сохранить складской номер"
        className="btn-primary px-2 py-1.5 disabled:opacity-30"
      >
        <CheckIcon className="h-4 w-4" />
      </button>
      {saved && !changed && (
        <PrintLabelButton
          target={{ categoryId, type }}
          layout="storage"
          className="p-1.5 text-brand-500 hover:text-brand-900"
        />
      )}
    </form>
  );
}
