"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setFrameTypeStockAction } from "@/app/admin/actions";
import { NumberInput } from "@/components/admin/form-parts";
import { CheckIcon } from "@/components/icons";

export function FrameTypeStockField({
  categoryId,
  type,
  initial,
  className = "",
}: {
  categoryId: string;
  type: string;
  initial: number | null;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const changed = value !== saved;

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !changed) return;
    startTransition(async () => {
      setProblem("");
      const result = await setFrameTypeStockAction(categoryId, type, value);
      if (!result.ok) {
        setProblem(result.problems.join(" "));
        return;
      }
      setSaved(value);
      setDone(true);
      router.refresh();
    });
  };

  return (
    <form onSubmit={save} className={`flex flex-wrap items-center gap-2 ${className}`}>
      <label className="flex items-center gap-2 text-xs text-brand-500">
        Остаток
        <NumberInput
          value={value}
          onChange={(next) => {
            setValue(next);
            setDone(false);
          }}
          placeholder="—"
          integer
          className="field tnum w-16 py-1.5 text-sm sm:w-20"
        />
      </label>
      <button type="submit" disabled={pending || !changed} className="btn-primary px-3 py-1.5 text-xs sm:px-5">
        {pending ? "Сохраняем…" : "Сохранить"}
      </button>
      {done && !changed && <CheckIcon className="h-4 w-4 text-green-700" />}
      {problem && <span className="text-xs text-red-700">{problem}</span>}
    </form>
  );
}
