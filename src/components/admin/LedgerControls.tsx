"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import {
  addLedgerEntryAction,
  deleteLedgerEntryAction,
  refreshCrmPaymentsAction,
  updateLedgerEntryAction,
} from "@/app/admin/accounting-actions";
import { AdminModal, ModalActions } from "@/components/admin/AdminModal";
import { Field, NumberInput, Problems } from "@/components/admin/form-parts";
import { MinusIcon, PencilIcon, PlusIcon, SpinnerIcon, TrashIcon } from "@/components/icons";
import type { LedgerEntry, LedgerKind } from "@/lib/accounting";

const pad = (value: number) => String(value).padStart(2, "0");

export function dateInput(timestamp: number = Date.now()): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const DANGER_BUTTON = "btn-primary bg-red-700 py-2 text-sm hover:bg-red-800";
const SUCCESS_BUTTON = "btn-primary bg-green-800 py-2 text-sm hover:bg-green-900";

export function CategoryInput({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (value: string) => void;
  categories: string[];
}) {
  const listId = useId();
  const query = value.trim().toLowerCase();
  const isNew = Boolean(query) && !categories.some((category) => category.toLowerCase() === query);
  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Например: расходники"
        maxLength={60}
        className="field"
      />
      <datalist id={listId}>
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      {isNew && <span className="mt-1 block text-xs text-brand-400">Новая категория «{value.trim()}» будет создана</span>}
    </>
  );
}

function useSubmit() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problems, setProblems] = useState<string[]>([]);
  const run = (action: () => Promise<{ ok: boolean; problems: string[] }>, onDone: () => void) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setProblems(result.problems);
        return;
      }
      setProblems([]);
      onDone();
      router.refresh();
    });
  };
  return { pending, problems, setProblems, run };
}

const ENTRY_LABELS = {
  out: { open: "Изъять средства", title: "Изъять средства", purpose: "Цель изъятия", placeholder: "Например: закупка расходников" },
  in: { open: "Внести средства", title: "Внести средства", purpose: "Источник", placeholder: "Например: перевод от учредителя" },
} as const;

export function LedgerEntryButton({ kind, categories }: { kind: LedgerKind; categories: string[] }) {
  const labels = ENTRY_LABELS[kind];
  const [open, setOpen] = useState(false);
  const { pending, problems, setProblems, run } = useSubmit();
  const [date, setDate] = useState(dateInput);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState<number | null>(null);

  const show = () => {
    setDate(dateInput());
    setDescription("");
    setCategory("");
    setAmount(null);
    setProblems([]);
    setOpen(true);
  };
  const close = () => setOpen(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => addLedgerEntryAction({ kind, date, description, category, amount }), close);
  };

  return (
    <>
      <button type="button" onClick={show} className={kind === "out" ? DANGER_BUTTON : SUCCESS_BUTTON}>
        {kind === "out" ? <MinusIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
        {labels.open}
      </button>
      {open && (
        <AdminModal title={labels.title} onClose={close}>
          <form onSubmit={submit} className="space-y-4">
            <Problems items={problems} />
            <Field label="Дата" required>
              <input
                type="date"
                value={date}
                max={dateInput()}
                onChange={(event) => setDate(event.target.value)}
                className="field"
              />
            </Field>
            <Field label={labels.purpose} required>
              <input
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={labels.placeholder}
                maxLength={300}
                className="field"
                autoFocus
              />
            </Field>
            {kind === "out" && (
              <Field label="Категория" required>
                <CategoryInput value={category} onChange={setCategory} categories={categories} />
              </Field>
            )}
            <Field label="Сумма, р." required>
              <NumberInput value={amount} onChange={setAmount} placeholder="0,00" />
            </Field>
            <ModalActions
              pending={pending}
              submitLabel="Добавить"
              submitClassName={kind === "out" ? DANGER_BUTTON : SUCCESS_BUTTON}
              onCancel={close}
            />
          </form>
        </AdminModal>
      )}
    </>
  );
}

function EditLedgerEntryModal({
  entry,
  categories,
  onClose,
}: {
  entry: LedgerEntry;
  categories: string[];
  onClose: () => void;
}) {
  const { pending, problems, run } = useSubmit();
  const [date, setDate] = useState(() => dateInput(entry.date));
  const [description, setDescription] = useState(entry.description);
  const [category, setCategory] = useState(entry.category);
  const [amount, setAmount] = useState<number | null>(entry.amount);
  const linkedToDebt = entry.debtId !== null;
  const withCategory = entry.kind === "out" && !linkedToDebt;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => updateLedgerEntryAction(entry.id, { date, description, category, amount }), onClose);
  };

  return (
    <AdminModal title="Редактировать запись" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Problems items={problems} />
        <Field label="Дата" required>
          <input
            type="date"
            value={date}
            max={dateInput()}
            onChange={(event) => setDate(event.target.value)}
            className="field"
          />
        </Field>
        <Field
          label="Сумма, р."
          required
          hint={linkedToDebt ? "Погашение долга — сумму не меняют, запись можно удалить" : undefined}
        >
          <NumberInput value={amount} onChange={setAmount} placeholder="0,00" disabled={linkedToDebt} />
        </Field>
        <Field label={entry.kind === "out" ? "Цель изъятия" : "Источник"} required>
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            readOnly={linkedToDebt}
            maxLength={300}
            className="field"
          />
        </Field>
        {withCategory && (
          <Field label="Категория" required>
            <CategoryInput value={category} onChange={setCategory} categories={categories} />
          </Field>
        )}
        <ModalActions pending={pending} submitLabel="Сохранить" onCancel={onClose} />
      </form>
    </AdminModal>
  );
}

export function LedgerEntryActions({ entry, categories }: { entry: LedgerEntry; categories: string[] }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { pending, problems, run } = useSubmit();

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => deleteLedgerEntryAction(entry.id), () => setConfirming(false))}
          className="btn-primary bg-red-700 px-2 py-1 text-xs hover:bg-red-800"
        >
          {pending && <SpinnerIcon className="h-3 w-3 animate-spin" />}
          Удалить
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="btn-ghost px-2 py-1 text-xs">
          Нет
        </button>
        {entry.debtId !== null && (
          <span className="w-full text-right text-xs text-brand-400">долг вернётся к прежнему остатку</span>
        )}
        {problems.length > 0 && <span className="w-full text-right text-xs text-red-700">{problems.join("; ")}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="Редактировать запись"
        className="btn-ghost px-2 py-1"
      >
        <PencilIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="Удалить запись"
        className="btn-ghost px-2 py-1 text-red-700 hover:bg-red-50"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </button>
      {editing && <EditLedgerEntryModal entry={entry} categories={categories} onClose={() => setEditing(false)} />}
    </span>
  );
}

export function RefreshCrmPaymentsButton() {
  const { pending, problems, run } = useSubmit();

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(refreshCrmPaymentsAction, () => undefined)}
        className="btn-ghost px-2 py-1 text-xs underline"
      >
        {pending && <SpinnerIcon className="h-3 w-3 animate-spin" />}
        Обновить из CRM
      </button>
      {problems.map((problem) => (
        <span key={problem} role="alert" className="text-xs text-red-700">
          {problem}
        </span>
      ))}
    </span>
  );
}
