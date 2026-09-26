"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  forgetVdfSessionAction,
  requestVdfCodeAction,
  loadVdfPricesAction,
  verifyVdfCodeAction,
} from "@/app/admin/actions";
import { SpinnerIcon } from "@/components/icons";

interface VdfPricesPanelProps {
  email: string | null;
  wholesale: boolean;
  running: boolean;
}

export function VdfPricesPanel({ email, wholesale, running }: VdfPricesPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [address, setAddress] = useState(email ?? "");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);

  const run = (task: () => Promise<{ ok: boolean; problems: string[] }>, done: string) => {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const result = await task();
        if (result.ok) setMessage(done);
        else setError(result.problems.join(" "));
      } catch {
        setError("Сервер не дождался ответа — обновите страницу через минуту, отчёт появится ниже");
      }
      router.refresh();
    });
  };

  const sync = () => {
    setSyncing(true);
    run(async () => {
      try {
        return await loadVdfPricesAction();
      } finally {
        setSyncing(false);
      }
    }, "Цены загружены и привязаны к курсу рубля");
  };

  return (
    <div className="card space-y-4 p-5">
      {email ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-brand-800">
            Вход на vdf-light.ru: <b>{email}</b>
            {wholesale ? " · оптовый кабинет" : " · кабинет не оптовый, себестоимости не будет"}
          </p>
          <button
            type="button"
            onClick={() => run(forgetVdfSessionAction, "Вход забыт")}
            disabled={pending}
            className="btn-ghost py-1.5 text-sm"
          >
            Выйти
          </button>
        </div>
      ) : (
        <p className="text-sm text-amber-800">
          Нет входа на vdf-light.ru. Он нужен только для загрузки цен, ежедневный пересчёт работает без него.
        </p>
      )}

      <details open={!email} className="text-sm">
        <summary className="cursor-pointer font-medium text-brand-700">
          {email ? "Войти заново" : "Войти по коду из почты"}
        </summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="label">Почта кабинета</span>
            <input
              type="email"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="field py-2 text-sm"
              placeholder="mail@example.com"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              run(() => requestVdfCodeAction(address), "Код отправлен, действует 15 минут");
              setCodeSent(true);
            }}
            disabled={pending || !address}
            className="btn-secondary py-2 text-sm"
          >
            Прислать код
          </button>
          {codeSent && (
            <>
              <label className="block">
                <span className="label">Код из письма</span>
                <input
                  inputMode="numeric"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="field w-28 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => run(() => verifyVdfCodeAction(address, code), "Вход выполнен")}
                disabled={pending || !code}
                className="btn-primary py-2 text-sm"
              >
                Войти
              </button>
            </>
          )}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3 border-t border-brand-100 pt-4">
        <button
          type="button"
          onClick={sync}
          disabled={pending || running || !email}
          className="btn-primary py-2 text-sm"
        >
          {syncing ? (
            <>
              <SpinnerIcon className="h-4 w-4 animate-spin" /> Загружаем, около минуты…
            </>
          ) : running ? (
            "Загрузка уже идёт"
          ) : (
            "Загрузить цены с vdf-light.ru"
          )}
        </button>
        {message && <span className="text-sm text-green-700">{message}</span>}
        {error && (
          <span className="text-sm text-red-700" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
