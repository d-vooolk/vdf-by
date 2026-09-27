"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  checkTelegramAction,
  saveTelegramSettingsAction,
  sendTestTelegramAction,
} from "@/app/admin/actions";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons";
import type { TelegramBot, TelegramChat } from "@/lib/telegram";

export function TelegramSettingsForm({
  initial,
  tokenMask,
}: {
  initial: { enabled: boolean; chatId: string; chatTitle: string };
  tokenMask: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState(initial.chatId);
  const [chatTitle, setChatTitle] = useState(initial.chatTitle);
  const [bot, setBot] = useState<TelegramBot | null>(null);
  const [chats, setChats] = useState<TelegramChat[] | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<"check" | "test" | null>(null);
  const [pending, startTransition] = useTransition();

  const hasToken = Boolean(token.trim() || tokenMask);
  const say = (tone: "ok" | "error", text: string) => setStatus({ tone, text });

  const check = async () => {
    setBusy("check");
    setStatus(null);
    try {
      const result = await checkTelegramAction(token);
      if (!result.ok) {
        setBot(null);
        setChats(null);
        say("error", result.error);
        return;
      }
      setBot(result.bot);
      setChats(result.chats);
      if (result.chats.length === 1 && !chatId) {
        setChatId(result.chats[0].id);
        setChatTitle(result.chats[0].title);
      }
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    setStatus(null);
    try {
      const result = await sendTestTelegramAction(token, chatId);
      if (result.ok) say("ok", "Тестовое сообщение отправлено — проверьте Telegram");
      else say("error", result.problems.join(" "));
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveTelegramSettingsAction({ enabled, token, chatId, chatTitle });
      if (result.ok) {
        say("ok", enabled ? "Сохранено: новые заказы будут приходить в Telegram" : "Сохранено, отправка выключена");
        setToken("");
        router.refresh();
      } else {
        say("error", result.problems.join(" "));
      }
    });

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
          <li>Вставьте токен ниже и нажмите «Проверить бота».</li>
          <li>
            Напишите своему боту <code className="rounded bg-brand-50 px-1">/start</code> — или добавьте
            его в группу, куда должны приходить заказы, и напишите там любое сообщение.
          </li>
          <li>Нажмите «Найти чаты», выберите чат, отправьте тест и сохраните.</li>
        </ol>
      </section>

      <section className="card space-y-4 p-5">
        <label className="block">
          <span className="label mb-1 text-xs">Токен бота</span>
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={tokenMask ? `сохранён: ${tokenMask} — оставьте пустым, чтобы не менять` : "123456789:AA…"}
            className="field font-mono text-sm"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={check} disabled={!hasToken || busy !== null} className="btn-secondary py-2 text-sm">
            {busy === "check" && <SpinnerIcon className="h-4 w-4 animate-spin" />}
            {bot ? "Найти чаты заново" : "Проверить бота и найти чаты"}
          </button>
          {bot && (
            <span className="flex items-center gap-1.5 text-sm text-green-700">
              <CheckIcon className="h-4 w-4" />
              Бот {bot.username ? `@${bot.username}` : bot.name} на связи
            </span>
          )}
        </div>

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
                  checked={chatId === chat.id}
                  onChange={() => {
                    setChatId(chat.id);
                    setChatTitle(chat.title);
                  }}
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
            value={chatId}
            onChange={(event) => {
              setChatId(event.target.value);
              setChatTitle("");
            }}
            placeholder="заполнится при выборе чата выше"
            className="field tnum w-64 text-sm"
          />
          {chatTitle && <span className="mt-1 block text-xs text-brand-400">{chatTitle}</span>}
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={test}
            disabled={!hasToken || !chatId || busy !== null}
            className="btn-secondary py-2 text-sm"
          >
            {busy === "test" && <SpinnerIcon className="h-4 w-4 animate-spin" />}
            Отправить тестовое сообщение
          </button>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-700">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Присылать новые заказы и заявки на опт в этот чат
        </label>
      </section>

      {status && (
        <p
          className={`flex items-start gap-1.5 text-sm ${status.tone === "ok" ? "text-green-700" : "text-red-700"}`}
          role={status.tone === "error" ? "alert" : undefined}
        >
          {status.tone === "ok" ? <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />}
          {status.text}
        </p>
      )}

      <button type="button" onClick={save} disabled={pending} className="btn-primary py-2 text-sm">
        {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
        Сохранить
      </button>
    </div>
  );
}
