"use client";

import { useState } from "react";

import {
  aiFaqAction,
  aiRewriteAction,
  saveAiPromptAction,
  type AiProductInput,
} from "@/app/admin/actions";
import { AlertIcon, SpinnerIcon } from "@/components/icons";
import type { AiTask } from "@/lib/ai";
import type { FaqItem } from "@/lib/schema";

export interface AiSettings {
  ready: boolean;
  prompts: Record<AiTask, string>;
  defaults: Record<AiTask, string>;
}

function usePrompt(settings: AiSettings, task: AiTask) {
  const [saved, setSaved] = useState(settings.prompts[task]);
  const [text, setText] = useState(settings.prompts[task]);
  return { saved, setSaved, text, setText };
}

function PromptEditor({
  task,
  settings,
  prompt,
}: {
  task: AiTask;
  settings: AiSettings;
  prompt: ReturnType<typeof usePrompt>;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const dirty = prompt.text.trim() !== prompt.saved.trim();
  const isDefault = prompt.saved.trim() === settings.defaults[task].trim();

  const persist = async (value: string | null) => {
    setBusy(true);
    setNote("");
    try {
      const prompts = await saveAiPromptAction(task, value);
      prompt.setSaved(prompts[task]);
      prompt.setText(prompts[task]);
      setNote(value === null ? "Вернули стандартный промт" : "Промт сохранён");
    } catch (error) {
      setNote(`Не сохранилось: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="group mt-2 rounded-xl border border-brand-100 bg-brand-50/40">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs text-brand-400 select-none hover:text-brand-700">
        <span className="inline-block transition-transform group-open:rotate-90">›</span>{" "}
        Настроить промт{!isDefault && " (изменён)"}
      </summary>
      <div className="space-y-2 px-3 pb-3">
        <textarea
          value={prompt.text}
          onChange={(event) => {
            prompt.setText(event.target.value);
            setNote("");
          }}
          rows={12}
          className="field resize-y font-mono text-xs leading-relaxed"
        />
        <p className="text-xs text-brand-400">
          Нейросеть получает этот текст как инструкцию, а следом название,
          раздел, бренд, характеристики и описание товара. Несохранённая правка
          тоже работает, но только до перезагрузки страницы.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => persist(prompt.text)}
            disabled={busy || !dirty}
            className="btn-secondary py-1.5 text-xs"
          >
            Сохранить промт
          </button>
          <button
            type="button"
            onClick={() => persist(null)}
            disabled={busy || (isDefault && !dirty)}
            className="btn-ghost py-1.5 text-xs"
          >
            Вернуть стандартный
          </button>
          {note && <span className="text-xs text-brand-500">{note}</span>}
        </div>
      </div>
    </details>
  );
}

function AiError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-red-700" role="alert">
      <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}

function NotConnected() {
  return (
    <p className="mt-2 text-xs text-brand-400">
      Рерайт и генерация вопросов заработают, когда в .env на сервере появится
      AI_API_KEY.
    </p>
  );
}

export function RewriteTool({
  settings,
  product,
  onRewrite,
}: {
  settings: AiSettings;
  product: Omit<AiProductInput, "prompt">;
  onRewrite: (text: string) => void;
}) {
  const prompt = usePrompt(settings, "rewrite");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previous, setPrevious] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await aiRewriteAction({ ...product, prompt: prompt.text });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPrevious(product.description);
      onRewrite(result.text);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={busy || !settings.ready}
          className="btn-secondary py-2 text-sm"
        >
          {busy ? (
            <>
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Переписываем…
            </>
          ) : (
            "Сделать рерайт"
          )}
        </button>
        {previous !== null && !busy && (
          <button
            type="button"
            onClick={() => {
              onRewrite(previous);
              setPrevious(null);
            }}
            className="btn-ghost py-2 text-sm"
          >
            Вернуть исходный текст
          </button>
        )}
      </div>
      {!settings.ready && <NotConnected />}
      <AiError message={error} />
      <PromptEditor task="rewrite" settings={settings} prompt={prompt} />
    </div>
  );
}

export function FaqTool({
  settings,
  product,
  onGenerate,
}: {
  settings: AiSettings;
  product: Omit<AiProductInput, "prompt">;
  onGenerate: (items: FaqItem[]) => void;
}) {
  const prompt = usePrompt(settings, "faq");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await aiFaqAction({ ...product, prompt: prompt.text });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onGenerate(result.items);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={busy || !settings.ready}
        className="btn-secondary py-2 text-sm"
      >
        {busy ? (
          <>
            <SpinnerIcon className="h-4 w-4 animate-spin" />
            Генерируем…
          </>
        ) : (
          "Сгенерировать вопрос-ответ"
        )}
      </button>
      {!settings.ready && <NotConnected />}
      <AiError message={error} />
      <PromptEditor task="faq" settings={settings} prompt={prompt} />
    </div>
  );
}
