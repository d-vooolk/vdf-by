"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { type BusinessPostFormInput, saveBusinessPostAction } from "@/app/admin/business-post-actions";
import { AlertIcon, SpinnerIcon } from "@/components/icons";

interface BusinessPostFormProps {
  id: number | null;
  initial: BusinessPostFormInput;
  submitLabel: string;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function BusinessPostForm({ id, initial, submitLabel, onSaved, onCancel }: BusinessPostFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(initial);
  const [problems, setProblems] = useState<string[]>([]);

  const update = (patch: Partial<BusinessPostFormInput>) => setForm({ ...form, ...patch });

  const submit = () =>
    startTransition(async () => {
      const result = await saveBusinessPostAction(id, form);
      setProblems(result.problems);
      if (!result.ok) return;
      if (id === null) setForm(initial);
      onSaved?.();
      router.refresh();
    });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-3 md:grid-cols-[14rem_1fr]">
        <label className="block">
          <span className="label">Когда прислать (Минск)</span>
          <input
            type="datetime-local"
            value={form.publishAt}
            onChange={(event) => update({ publishAt: event.target.value })}
            className="field tnum"
          />
        </label>
        <label className="block">
          <span className="label">Заголовок</span>
          <input value={form.title} onChange={(event) => update({ title: event.target.value })} className="field" />
        </label>
      </div>
      <label className="block">
        <span className="label">Текст поста</span>
        <textarea
          value={form.body}
          onChange={(event) => update({ body: event.target.value })}
          rows={7}
          className="field"
        />
        <span className="mt-1 block text-xs text-brand-400">{form.body.trim().length} знаков</span>
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="label">Картинка (адрес JPG)</span>
          <input
            value={form.imageUrl}
            onChange={(event) => update({ imageUrl: event.target.value })}
            placeholder="https://vdf.by/img/…-1200.jpg"
            className="field"
          />
        </label>
        <label className="block">
          <span className="label">Ссылка для Яндекса</span>
          <input
            value={form.linkUrl}
            onChange={(event) => update({ linkUrl: event.target.value })}
            placeholder="https://vdf.by/…?utm_source=yandex_business"
            className="field"
          />
        </label>
      </div>

      {problems.length > 0 && (
        <p className="flex items-start gap-1.5 text-sm text-red-700" role="alert">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {problems.join(". ")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost">
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}
