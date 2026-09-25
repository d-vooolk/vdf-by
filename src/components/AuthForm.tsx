"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PRIVACY_URL } from "@/components/ConsentCheckbox";
import { AlertIcon, SpinnerIcon } from "@/components/icons";
import { useAccount } from "@/store/account";

type Mode = "login" | "register";
type Kind = "retail" | "wholesale";

interface Answer {
  ok?: boolean;
  sent?: boolean;
  retryIn?: number;
  error?: string;
  registered?: boolean;
  unknown?: boolean;
}

async function post(body: Record<string, unknown>): Promise<Answer> {
  const response = await fetch("/api/account/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return ((await response.json().catch(() => ({}))) as Answer) ?? {};
}

export function AuthForm({ initialMode = "login" }: { initialMode?: Mode }) {
  const router = useRouter();
  const loadAccount = useAccount((state) => state.load);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [kind, setKind] = useState<Kind>("retail");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+375 ");
  const [address, setAddress] = useState("");
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"form" | "code">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const waitLeft = Math.max(0, Math.ceil((retryAt - now) / 1000));

  const switchMode = (next: Mode) => {
    setMode(next);
    setStep("form");
    setError("");
    setCode("");
  };

  const requestCode = async () => {
    setError("");
    if (mode === "register") {
      if (name.trim().length < 2) return setError("Укажите ФИО или название компании");
      if (kind === "wholesale" && address.trim().length < 5) {
        return setError("Укажите адрес магазина или мастерской");
      }
      if (!consent) return setError("Нужно согласие на обработку персональных данных");
    }
    setBusy(true);
    try {
      const answer = await post(
        mode === "register"
          ? { action: "register", name, kind, phone, address, consent }
          : { action: "login", phone },
      );
      if (answer.retryIn) {
        setRetryAt(Date.now() + answer.retryIn * 1000);
        setNow(Date.now());
      }
      if (answer.sent) {
        setStep("code");
        return;
      }
      setError(answer.error ?? "Не получилось отправить код");
      if (answer.registered) setMode("login");
      if (answer.unknown) setMode("register");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError("");
    setBusy(true);
    try {
      const answer = await post({ action: "verify", phone, code });
      if (!answer.ok) {
        setError(answer.error ?? "Неверный код");
        return;
      }
      await loadAccount(true);
      router.push("/account/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card mx-auto max-w-md space-y-5 p-6 sm:p-8">
      <div className="grid grid-cols-2 rounded-xl bg-brand-50 p-1 text-sm font-medium">
        {(["login", "register"] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => switchMode(entry)}
            className={`rounded-lg py-2 transition-colors ${
              mode === entry ? "bg-white text-brand-900 shadow-sm" : "text-brand-500"
            }`}
          >
            {entry === "login" ? "Вход" : "Регистрация"}
          </button>
        ))}
      </div>

      {step === "form" ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void requestCode();
          }}
        >
          {mode === "register" && (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {(["retail", "wholesale"] as const).map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    role="radio"
                    aria-checked={kind === entry}
                    onClick={() => setKind(entry)}
                    className={`rounded-xl border px-3 py-2.5 font-medium transition-colors ${
                      kind === entry
                        ? "border-brand-600 bg-brand-50 text-brand-900 ring-1 ring-brand-600"
                        : "border-brand-200 text-brand-600 hover:border-brand-300"
                    }`}
                  >
                    {entry === "retail" ? "Розничный покупатель" : "Оптовый покупатель"}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="label">
                  {kind === "wholesale" ? "Название компании или ФИО" : "ФИО"}
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete={kind === "wholesale" ? "organization" : "name"}
                  className="field"
                  required
                />
              </label>
            </>
          )}

          <label className="block">
            <span className="label">Номер телефона</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              inputMode="tel"
              placeholder="+375 29 123-45-67"
              className="field tnum"
              required
            />
          </label>

          {mode === "register" && kind === "wholesale" && (
            <label className="block">
              <span className="label">Адрес магазина или мастерской</span>
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                autoComplete="street-address"
                className="field"
                required
              />
              <span className="mt-1 block text-xs text-brand-400">
                Оптовые цены откроются после того, как менеджер созвонится с вами и подтвердит
                заявку.
              </span>
            </label>
          )}

          {mode === "register" && (
            <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-brand-500">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-brand-200 text-brand-700 focus:ring-brand-600"
              />
              <span>
                Даю согласие на обработку моих персональных данных (ФИО или название компании,
                телефон, адрес) для регистрации, входа в личный кабинет и выполнения заказов — на
                условиях{" "}
                <Link
                  href={PRIVACY_URL}
                  target="_blank"
                  className="font-medium text-brand-700 underline hover:text-brand-900"
                >
                  Политики обработки персональных данных
                </Link>
                <span className="text-red-600"> *</span>
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={busy || waitLeft > 0 || (mode === "register" && !consent)}
            className="btn-primary w-full"
          >
            {busy && <SpinnerIcon className="h-4 w-4 animate-spin" />}
            {waitLeft > 0
              ? `Повторить через ${waitLeft} с`
              : mode === "register"
                ? "Зарегистрироваться"
                : "Получить код по SMS"}
          </button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void verify();
          }}
        >
          <p className="text-sm text-brand-600">
            Отправили SMS с кодом на номер <span className="tnum font-medium">{phone}</span>.
          </p>
          <label className="block">
            <span className="label">Код из SMS</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="field tnum text-center text-lg tracking-[0.4em]"
              autoFocus
              required
            />
          </label>
          <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full">
            {busy && <SpinnerIcon className="h-4 w-4 animate-spin" />}
            {mode === "register" ? "Подтвердить и войти" : "Войти"}
          </button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button
              type="button"
              onClick={() => {
                setStep("form");
                setError("");
              }}
              className="text-brand-600 underline"
            >
              Изменить номер
            </button>
            <button
              type="button"
              onClick={() => void requestCode()}
              disabled={busy || waitLeft > 0}
              className="text-brand-600 underline disabled:text-brand-300 disabled:no-underline"
            >
              {waitLeft > 0 ? `Новый код через ${waitLeft} с` : "Прислать код ещё раз"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-red-700" role="alert">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <p className="text-center text-xs text-brand-400">
        Регистрация не обязательна: заказать можно и без неё.
      </p>
    </div>
  );
}
