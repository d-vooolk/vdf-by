"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  checkTelegramAction,
  saveTelegramSettingsAction,
  sendTestTelegramAction,
} from "@/app/admin/actions";
import { EditableCard, EditableField, EditableSwitch, type SaveResult } from "@/components/admin/Editable";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons";
import type { TelegramBot, TelegramChat } from "@/lib/telegram";

interface TelegramState {
  enabled: boolean;
  chatId: string;
  chatTitle: string;
}

function ChatPicker({
  draft,
  onChange,
}: {
  draft: TelegramState;
  onChange: (next: TelegramState) => void;
}) {
  const [bot, setBot] = useState<TelegramBot | null>(null);
  const [chats, setChats] = useState<TelegramChat[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const find = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await checkTelegramAction("");
      if (!result.ok) {
        setBot(null);
        setChats(null);
        setError(result.error);
        return;
      }
      setBot(result.bot);
      setChats(result.chats);
      if (result.chats.length === 1 && !draft.chatId) {
        onChange({ ...draft, chatId: result.chats[0].id, chatTitle: result.chats[0].title });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={find} disabled={busy} className="btn-secondary py-2 text-sm">
          {busy && <SpinnerIcon className="h-4 w-4 animate-spin" />}
          {bot ? "Найти чаты заново" : "Найти чаты бота"}
        </button>
        {bot && (
          <span className="flex items-center gap-1.5 text-sm text-green-700">
            <CheckIcon className="h-4 w-4" />
            Бот {bot.username ? `@${bot.username}` : bot.name} на связи
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {chats !== null && (
        <div className="space-y-2">
          <p className="text-xs text-brand-400">
            {chats.length
              ? "Чаты, где боту писали. Выберите, куда присылать заказы:"
              : "Боту ещё никто не писал. Напишите ему /start (или сообщение в группе с ботом) и нажмите «Найти чаты заново»."}
          </p>
          {chats.map((chat) => (
            <label key={chat.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="telegram-chat"
                checked={draft.chatId === chat.id}
                onChange={() => onChange({ ...draft, chatId: chat.id, chatTitle: chat.title })}
              />
              <span className="font-medium text-brand-900">{chat.title}</span>
              <span className="text-xs text-brand-400">
                {chat.kind}, id {chat.id}
              </span>
            </label>
          ))}
        </div>
      )}
      <label className="block">
        <span className="label mb-1 text-xs">ID чата</span>
        <input
          value={draft.chatId}
          onChange={(event) => onChange({ ...draft, chatId: event.target.value, chatTitle: "" })}
          placeholder="заполнится при выборе чата выше"
          className="field tnum w-64 py-2 text-sm"
        />
      </label>
    </div>
  );
}

export function TelegramSettingsForm({
  initial,
  tokenMask,
}: {
  initial: TelegramState;
  tokenMask: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<TelegramState>(initial);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const persist = async (changes: Partial<TelegramState & { token: string }>): Promise<SaveResult> => {
    const { token = "", ...fields } = changes;
    const next = { ...state, ...fields };
    const result = await saveTelegramSettingsAction({ ...next, token });
    if (!result.ok) return result.problems;
    setState(next);
    router.refresh();
    return [];
  };

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const result = await sendTestTelegramAction("", state.chatId);
      setStatus(
        result.ok
          ? { tone: "ok", text: "Тестовое сообщение отправлено — проверьте Telegram" }
          : { tone: "error", text: result.problems.join(" ") },
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="card space-y-3 p-5 text-sm text-brand-600">
        <h2 className="font-semibold text-brand-900">Как подключить</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            В Telegram откройте{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-900 underline">
              @BotFather
            </a>
            , отправьте <code className="rounded bg-brand-50 px-1">/newbot</code> и скопируйте токен
            вида <code className="rounded bg-brand-50 px-1">123456789:AA…</code>.
          </li>
          <li>Нажмите карандаш у «Токена бота», вставьте токен и сохраните.</li>
          <li>
            Напишите своему боту <code className="rounded bg-brand-50 px-1">/start</code> — или добавьте
            его в группу, куда должны приходить заказы, и напишите там любое сообщение.
          </li>
          <li>Нажмите карандаш у «Чата», найдите чаты, выберите нужный, сохраните и отправьте тест.</li>
        </ol>
      </section>

      <section className="card px-5 py-2">
        <EditableSwitch
          label="Присылать новые заказы и заявки на опт"
          description="В выбранный чат Telegram"
          checked={state.enabled}
          onSave={(enabled) => persist({ enabled })}
        />
        <EditableField
          label="Токен бота"
          value={tokenMask}
          secret
          type="password"
          mono
          placeholder="123456789:AA…"
          onSave={(token) => (token.trim() ? persist({ token }) : Promise.resolve(["Вставьте токен"]))}
        />
        <div className="py-3">
          <EditableCard
            value={state}
            view={(value) => (
              <div>
                <p className="text-xs font-medium text-brand-400">Чат</p>
                <p className={`mt-0.5 text-sm ${value.chatId ? "text-brand-900" : "text-brand-300"}`}>
                  {value.chatId ? (
                    <>
                      {value.chatTitle || "без названия"} <span className="tnum text-xs text-brand-400">id {value.chatId}</span>
                    </>
                  ) : (
                    "не выбран"
                  )}
                </p>
              </div>
            )}
            editor={(draft, change) => <ChatPicker draft={draft} onChange={change} />}
            onSave={(next) => persist({ chatId: next.chatId, chatTitle: next.chatTitle })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 py-3">
          <button
            type="button"
            onClick={test}
            disabled={!tokenMask || !state.chatId || testing}
            className="btn-secondary py-2 text-sm"
          >
            {testing && <SpinnerIcon className="h-4 w-4 animate-spin" />}
            Отправить тестовое сообщение
          </button>
          {status && (
            <span
              className={`flex items-start gap-1.5 text-sm ${status.tone === "ok" ? "text-green-700" : "text-red-700"}`}
              role={status.tone === "error" ? "alert" : undefined}
            >
              {status.tone === "ok" ? <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />}
              {status.text}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
