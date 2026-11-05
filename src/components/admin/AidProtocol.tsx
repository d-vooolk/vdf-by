"use client";

import { useEffect, useState } from "react";

import { useBackdropClose } from "@/lib/use-backdrop-close";

type Step = "idle" | "confirm1" | "confirm2" | "confirm3" | "pin" | "progress";

interface Progress {
  label: string;
  percent: number;
  finished: boolean;
}

type PanicMessage = { step: number; total: number; label: string } | { done: boolean };

async function runPanic(pin: string, onProgress: (progress: Progress) => void): Promise<boolean> {
  const response = await fetch("/admin/api/panic/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (!response.ok || !response.body) return false;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line) as PanicMessage;
      if ("done" in message) done = message.done;
      else onProgress({ label: message.label, percent: Math.round((message.step / message.total) * 100), finished: false });
    }
  }
  return done;
}

function ProgressRing({ percent }: { percent: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90" aria-hidden="true">
      <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="8" className="stroke-brand-100" />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percent / 100)}
        className="stroke-red-600 transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}

const DANGER =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60";

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const backdrop = useBackdropClose(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/50 p-4" {...backdrop}>
      <div className="w-full max-w-sm rounded-card border border-brand-100 bg-white p-5 shadow-xl">
        {children}
      </div>
    </div>
  );
}

export function AidProtocol({ configured }: { configured: boolean }) {
  const [step, setStep] = useState<Step>("idle");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<Progress>({ label: "Проверка PIN", percent: 0, finished: false });

  const close = () => {
    setStep("idle");
    setPin("");
  };

  const submitPin = async () => {
    if (!pin.trim() || sending) return;
    setSending(true);
    setProgress({ label: "Проверка PIN", percent: 0, finished: false });
    setStep("progress");
    try {
      const done = await runPanic(pin.trim(), setProgress);
      if (done) {
        setProgress({ label: "Готово", percent: 100, finished: true });
        window.setTimeout(() => window.location.replace("/admin/login/"), 1500);
        return;
      }
      close();
    } catch {
      close();
    } finally {
      setSending(false);
    }
  };

  const cancel = (
    <button type="button" onClick={close} className="btn-ghost px-4 py-2 text-sm">
      Отмена
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="card space-y-2 p-5 text-sm text-brand-600">
        <h2 className="font-semibold text-brand-900">Протокол AID</h2>
        <p>
          Тревожная кнопка. Верный PIN — вся база шифруется вашим ключом в архив, после чего админка
          переходит в облегчённый режим: удаляются покупатели, заказы без отметки «Оплата по РС»,
          приходно-расходная касса и сверка с CRM, себестоимость и закупочные цены, из сводки пропадает аналитика (остаётся SEO),
          стираются локальные и облачные копии, все устройства выходят. Остаются заказы по РС,
          бухгалтерия «Приход» и «Долги», установка, лист ожидания, каталог и настройки. Повторно
          кнопка не показывается.
        </p>
        <p>
          Протокол срабатывает одновременно и в CRM, и в VDF: нажатие в одном сервисе запускает оба.
        </p>
        {!configured && (
          <p className="font-medium text-red-700">
            Кнопка не настроена: нет ключа или PIN в .env. Пока ничего не произойдёт.
          </p>
        )}
      </div>

      <button type="button" className={DANGER} onClick={() => setStep("confirm1")}>
        Запустить протокол AID
      </button>

      {step === "confirm1" && (
        <Overlay onClose={close}>
          <p className="mb-4 text-sm text-brand-700">Запустить протокол AID?</p>
          <div className="flex justify-end gap-2">
            {cancel}
            <button type="button" className={DANGER} onClick={() => setStep("confirm2")}>
              Запустить
            </button>
          </div>
        </Overlay>
      )}

      {step === "confirm2" && (
        <Overlay onClose={close}>
          <p className="mb-4 text-sm text-brand-700">Данные будут удалены. Подтвердить?</p>
          <div className="flex justify-start gap-2">
            <button type="button" className={DANGER} onClick={() => setStep("confirm3")}>
              Подтвердить
            </button>
            {cancel}
          </div>
        </Overlay>
      )}

      {step === "confirm3" && (
        <Overlay onClose={close}>
          <p className="mb-4 text-sm text-brand-700">Это необратимо. Продолжить?</p>
          <div className="flex flex-col gap-2">
            {cancel}
            <button type="button" className={DANGER} onClick={() => setStep("pin")}>
              Да, продолжить
            </button>
          </div>
        </Overlay>
      )}

      {step === "progress" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/60 p-4" role="alertdialog" aria-live="polite">
          <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-card border border-brand-100 bg-white p-6 shadow-xl">
            <div className="relative">
              <ProgressRing percent={progress.percent} />
              <span className="tnum absolute inset-0 flex items-center justify-center text-xl font-semibold text-brand-900">
                {progress.percent}%
              </span>
            </div>
            <p className="text-center text-sm font-medium text-brand-800">{progress.label}</p>
            {progress.finished && <p className="text-center text-xs text-brand-400">Все устройства выходят из админки</p>}
          </div>
        </div>
      )}

      {step === "pin" && (
        <Overlay onClose={close}>
          <p className="mb-3 text-sm text-brand-700">Введите PIN</p>
          <input
            type="password"
            autoFocus
            autoComplete="off"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submitPin()}
            maxLength={100}
            className="field w-full py-2 text-sm"
          />
          <div className="mt-4 flex justify-end gap-2">
            {cancel}
            <button type="button" className={DANGER} disabled={!pin.trim() || sending} onClick={submitPin}>
              Запустить
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}
