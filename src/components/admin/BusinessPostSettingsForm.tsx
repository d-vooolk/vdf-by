"use client";

import { useState, useTransition } from "react";

import { saveBusinessPostSettingsAction } from "@/app/admin/business-post-actions";
import { SpinnerIcon } from "@/components/icons";

export function BusinessPostSettingsForm({ cabinetUrl }: { cabinetUrl: string }) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(cabinetUrl);
  const [status, setStatus] = useState("");

  const submit = () =>
    startTransition(async () => {
      const result = await saveBusinessPostSettingsAction(value);
      setStatus(result.ok ? "Сохранено" : result.problems.join(". "));
    });

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="block min-w-0 flex-1">
        <span className="label">Ссылка на раздел публикаций в кабинете Яндекс Бизнеса</span>
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setStatus("");
          }}
          placeholder="https://yandex.ru/sprav/…"
          className="field"
        />
      </label>
      <button type="submit" disabled={pending} className="btn-secondary">
        {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
        Сохранить
      </button>
      {status && <p className="w-full text-xs text-brand-500">{status}</p>}
    </form>
  );
}
