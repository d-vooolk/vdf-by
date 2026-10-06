"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addWriteoffAction,
  deleteWriteoffAction,
  refreshCrmPaymentsAction,
} from "@/app/admin/accounting-actions";
import { Field, NumberInput, Problems } from "@/components/admin/form-parts";
import { SpinnerIcon, TrashIcon } from "@/components/icons";

function todayInput(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function WriteoffForm({ defaultPerson }: { defaultPerson: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayInput);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [person, setPerson] = useState(defaultPerson);
  const [problems, setProblems] = useState<string[]>([]);

  const close = () => {
    setOpen(false);
    setProblems([]);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await addWriteoffAction({ date, description, amount, person });
      if (!result.ok) {
        setProblems(result.problems);
        return;
      }
      setDescription("");
      setAmount(null);
      setDate(todayInput());
      close();
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary bg-red-700 py-2 text-sm hover:bg-red-800"
      >
        − Списать средства
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card w-full space-y-4 p-4 sm:p-5">
      <h2 className="text-sm font-bold text-brand-900">Списать средства</h2>
      <Problems items={problems} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Дата" required>
          <input
            type="date"
            value={date}
            max={todayInput()}
            onChange={(event) => setDate(event.target.value)}
            className="field"
          />
        </Field>
        <Field label="Сумма, р." required>
          <NumberInput value={amount} onChange={setAmount} placeholder="0,00" />
        </Field>
        <Field label="Цель списания" required>
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Например: закупка рамок у поставщика"
            maxLength={300}
            className="field"
          />
        </Field>
        <Field label="Изыматель" required>
          <input
            type="text"
            value={person}
            onChange={(event) => setPerson(event.target.value)}
            maxLength={150}
            className="field"
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary bg-red-700 py-2 text-sm hover:bg-red-800"
        >
          {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
          Списать
        </button>
        <button type="button" onClick={close} className="btn-ghost py-2 text-sm">
          Отмена
        </button>
      </div>
    </form>
  );
}

export function DeleteWriteoffButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState("");

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="Удалить списание"
        className="btn-ghost px-2 py-1 text-red-700 hover:bg-red-50"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteWriteoffAction(id);
            if (!result.ok) {
              setProblem(result.problems.join("; "));
              return;
            }
            router.refresh();
          })
        }
        className="btn-primary bg-red-700 px-2 py-1 text-xs hover:bg-red-800"
      >
        Удалить
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="btn-ghost px-2 py-1 text-xs">
        Нет
      </button>
      {problem && <span className="w-full text-right text-xs text-red-700">{problem}</span>}
    </span>
  );
}

export function RefreshCrmPaymentsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problems, setProblems] = useState<string[]>([]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await refreshCrmPaymentsAction();
            setProblems(result.ok ? [] : result.problems);
            router.refresh();
          })
        }
        className="btn-secondary py-2 text-sm"
      >
        {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
        Обновить из CRM
      </button>
      {problems.map((problem) => (
        <p key={problem} role="alert" className="text-xs text-red-700">
          {problem}
        </p>
      ))}
    </div>
  );
}
