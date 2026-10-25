"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { runPanicAction } from "@/app/admin/security-actions";
import { useBackdropClose } from "@/lib/use-backdrop-close";

type Step = "idle" | "confirm1" | "confirm2" | "confirm3" | "pin";

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
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);

  const close = () => {
    setStep("idle");
    setPin("");
  };

  const submitPin = async () => {
    if (!pin.trim() || sending) return;
    setSending(true);
    try {
      const { done } = await runPanicAction(pin.trim());
      if (done) {
        router.replace("/admin/login/");
        router.refresh();
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
          Тревожная кнопка. Верный PIN — вся база шифруется вашим ключом и выгружается в
          зашифрованный архив, после чего из базы удаляются покупатели, заказы, заявки, бухгалтерия,
          SMS-журнал, себестоимость и закупочные цены, стираются локальные и облачные копии, все
          устройства выходят. Каталог, настройки и входы в админку остаются.
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
