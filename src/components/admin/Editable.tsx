"use client";

import { useState, useTransition } from "react";

import { PencilIcon, SpinnerIcon, TrashIcon } from "@/components/icons";

export type SaveResult = string[];

function Actions({
  pending,
  onSave,
  onCancel,
  saveLabel = "Сохранить",
}: {
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onSave} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">
        {pending ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : saveLabel}
      </button>
      <button type="button" onClick={onCancel} disabled={pending} className="btn-ghost px-3 py-1.5 text-sm">
        Отмена
      </button>
    </div>
  );
}

function ProblemList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-0.5 text-xs text-red-700">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="btn-ghost shrink-0 p-2 text-brand-400 hover:text-brand-900"
    >
      <PencilIcon className="h-4 w-4" />
    </button>
  );
}

export function EditableField({
  label,
  hint,
  value,
  placeholder,
  multiline = false,
  inputMode,
  type = "text",
  mono = false,
  secret = false,
  onSave,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  type?: "text" | "email" | "password";
  mono?: boolean;
  secret?: boolean;
  onSave: (value: string) => Promise<SaveResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const open = () => {
    setDraft(secret ? "" : value);
    setProblems([]);
    setEditing(true);
  };

  const save = () =>
    startTransition(async () => {
      const result = await onSave(draft);
      setProblems(result);
      if (!result.length) setEditing(false);
    });

  const shown = secret && value ? "••••••••" : value;

  return (
    <div className="border-b border-brand-100 py-3 last:border-b-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-brand-400">{label}</p>
          {editing ? (
            <div className="mt-1.5 space-y-2">
              {multiline ? (
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                  placeholder={placeholder}
                  autoFocus
                  className="field resize-y py-2 text-sm"
                />
              ) : (
                <input
                  type={type}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") save();
                    if (event.key === "Escape") setEditing(false);
                  }}
                  placeholder={placeholder}
                  inputMode={inputMode}
                  autoFocus
                  className={`field py-2 text-sm ${mono ? "tnum" : ""}`}
                />
              )}
              {hint && <p className="text-xs text-brand-400">{hint}</p>}
              <ProblemList items={problems} />
              <Actions pending={pending} onSave={save} onCancel={() => setEditing(false)} />
            </div>
          ) : (
            <p
              className={`mt-0.5 text-sm break-words whitespace-pre-line ${shown ? "text-brand-900" : "text-brand-300"} ${
                mono ? "tnum" : ""
              }`}
            >
              {shown || "не заполнено"}
            </p>
          )}
        </div>
        {!editing && <EditButton onClick={open} label={`Изменить: ${label}`} />}
      </div>
    </div>
  );
}

export function EditableCard<T>({
  value,
  view,
  editor,
  onSave,
  onDelete,
  startEditing = false,
  onCancelNew,
  deleteConfirm = "Удалить?",
}: {
  value: T;
  view: (value: T) => React.ReactNode;
  editor: (draft: T, change: (next: T) => void) => React.ReactNode;
  onSave: (value: T) => Promise<SaveResult>;
  onDelete?: () => Promise<SaveResult>;
  startEditing?: boolean;
  onCancelNew?: () => void;
  deleteConfirm?: string;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(value);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await onSave(draft);
      setProblems(result);
      if (!result.length) setEditing(false);
    });

  const remove = () => {
    if (!onDelete || !window.confirm(deleteConfirm)) return;
    startTransition(async () => setProblems(await onDelete()));
  };

  const cancel = () => {
    setEditing(false);
    setProblems([]);
    onCancelNew?.();
  };

  return (
    <div className="rounded-card border border-brand-100 p-3 sm:p-4">
      {editing ? (
        <div className="space-y-3">
          {editor(draft, setDraft)}
          <ProblemList items={problems} />
          <Actions pending={pending} onSave={save} onCancel={cancel} />
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{view(value)}</div>
          <EditButton
            onClick={() => {
              setDraft(value);
              setProblems([]);
              setEditing(true);
            }}
            label="Изменить"
          />
          {onDelete && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-label="Удалить"
              title="Удалить"
              className="btn-ghost shrink-0 p-2 text-brand-400 hover:text-red-700"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {!editing && <ProblemList items={problems} />}
    </div>
  );
}

export function EditableSwitch({
  label,
  description,
  checked,
  onSave,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onSave: (checked: boolean) => Promise<SaveResult>;
}) {
  const [value, setValue] = useState(checked);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      const next = !value;
      const result = await onSave(next);
      setProblems(result);
      if (!result.length) setValue(next);
    });

  return (
    <div className="border-b border-brand-100 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-brand-900">{label}</p>
          {description && <p className="mt-0.5 text-xs text-brand-500">{description}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={label}
          disabled={pending}
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
            value ? "bg-brand-700" : "bg-brand-200"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              value ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      <ProblemList items={problems} />
    </div>
  );
}
