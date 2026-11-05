"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { importBusinessPostsAction } from "@/app/admin/business-post-actions";
import { AlertIcon, SpinnerIcon } from "@/components/icons";

export function BusinessPostImport() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [markdown, setMarkdown] = useState("");
  const [time, setTime] = useState("10:00");
  const [message, setMessage] = useState("");
  const [problems, setProblems] = useState<string[]>([]);

  const submit = () =>
    startTransition(async () => {
      const result = await importBusinessPostsAction(markdown, time);
      setProblems(result.problems);
      if (!result.ok || !result.report) {
        setMessage("");
        return;
      }
      const { added, duplicates, past, empty } = result.report;
      setMessage(
        [
          `Найдено постов: ${result.found}`,
          `добавлено: ${added}`,
          duplicates ? `уже были: ${duplicates}` : "",
          past ? `пропущено прошедших: ${past}` : "",
          empty ? `без текста: ${empty}` : "",
        ]
          .filter(Boolean)
          .join(", "),
      );
      if (added) setMarkdown("");
      router.refresh();
    });

  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-sm font-semibold text-brand-900">Загрузить план постов из Markdown</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <p className="text-sm text-brand-500">
          Вставьте файл плана целиком, например docs/business-posts-2026-11.md. Каждый пост начинается с заголовка
          «## 06.11 Пт — Тема» (можно со временем: «## 06.11 12:30 Пт — Тема»), из пунктов берутся «Картинка:» и
          «Яндекс:», остальное — текст. Прошедшие даты и уже загруженные посты пропускаются.
        </p>
        <textarea
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
          rows={8}
          className="field font-mono text-xs"
          placeholder="## 06.11 Пт — Полировка или замена стекла фары?"
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="label">Время, если в заголовке не указано</span>
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="field tnum" />
          </label>
          <button type="submit" disabled={pending || !markdown.trim()} className="btn-primary">
            {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
            Загрузить
          </button>
        </div>
        {message && <p className="text-sm text-green-800">{message}</p>}
        {problems.length > 0 && (
          <p className="flex items-start gap-1.5 text-sm text-red-700" role="alert">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {problems.join(". ")}
          </p>
        )}
      </form>
    </details>
  );
}
