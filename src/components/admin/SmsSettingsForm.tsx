"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { checkSmsAction, saveSmsSettingsAction, sendTestSmsAction } from "@/app/admin/actions";
import { AlertIcon, CheckIcon } from "@/components/icons";
import type { SmsConnection } from "@/lib/sms";

interface Templates {
  codeTemplate: string;
  approvedTemplate: string;
}

export function SmsSettingsForm({
  initial,
  tokenMask,
  defaults,
  variables,
}: {
  initial: { enabled: boolean; alphanameId: string; alphaname: string } & Templates;
  tokenMask: string;
  defaults: Templates;
  variables: Record<keyof Templates, Array<[string, string]>>;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [token, setToken] = useState("");
  const [alphanameId, setAlphanameId] = useState(initial.alphanameId);
  const [templates, setTemplates] = useState<Templates>({
    codeTemplate: initial.codeTemplate,
    approvedTemplate: initial.approvedTemplate,
  });
  const [info, setInfo] = useState<SmsConnection | null>(
    initial.alphanameId
      ? { balance: 0, currency: "", alphanames: [{ id: initial.alphanameId, name: initial.alphaname }] }
      : null,
  );
  const [testPhone, setTestPhone] = useState("");
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"check" | "test" | null>(null);

  const say = (tone: "ok" | "error", text: string) => setStatus({ tone, text });

  const save = () =>
    startTransition(async () => {
      const alphaname = info?.alphanames.find((entry) => entry.id === alphanameId)?.name ?? "";
      const result = await saveSmsSettingsAction({
        enabled,
        token,
        alphanameId,
        alphaname,
        ...templates,
      });
      if (result.ok) {
        say("ok", "SMS настройки сохранены");
        setToken("");
        router.refresh();
      } else {
        say("error", result.problems.join(" "));
      }
    });

  const check = async () => {
    setBusy("check");
    setStatus(null);
    try {
      const result = await checkSmsAction(token);
      if (result.ok) setInfo(result.info);
      else {
        setInfo(null);
        say("error", result.error);
      }
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    setStatus(null);
    try {
      const result = await sendTestSmsAction(testPhone, "");
      if (result.ok) say("ok", `Тестовое SMS отправлено на ${testPhone}`);
      else say("error", result.problems.join(" "));
    } finally {
      setBusy(null);
    }
  };

  const templateField = (key: keyof Templates, label: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <textarea
        value={templates[key]}
        onChange={(event) => setTemplates((current) => ({ ...current, [key]: event.target.value }))}
        rows={3}
        placeholder={defaults[key]}
        className="field"
      />
      <span className="mt-1 block text-xs text-brand-400">
        {variables[key].map(([name, hint]) => (
          <span key={name} className="mr-3 inline-block">
            <code className="rounded bg-brand-50 px-1 text-brand-700">{name}</code> — {hint}
          </span>
        ))}
      </span>
    </label>
  );

  return (
    <div className="card space-y-5 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-brand-900">Отправка SMS</p>
          <p className="text-sm text-brand-500">
            Коды входа в личный кабинет и уведомление о подтверждении опта
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((value) => !value)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-brand-700" : "bg-brand-200"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-[3fr_2fr]">
        <label className="block">
          <span className="label">API-токен sms.by</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={tokenMask ? `Задан: ${tokenMask}` : "0e11a2c8810eaec4c20f86b5caa394eb"}
            autoComplete="off"
            className="field"
          />
          <span className="mt-1 block text-xs text-brand-400">
            Личный кабинет app.sms.by → Настройки → API.
            {tokenMask && " Оставьте пустым, чтобы не менять сохранённый."}
          </span>
        </label>
        <label className="block">
          <span className="label">Альфа-имя (отправитель)</span>
          <select
            value={alphanameId}
            onChange={(event) => setAlphanameId(event.target.value)}
            className="field"
            disabled={!info}
          >
            <option value="">{info ? "Без альфа-имени" : "Сначала проверьте подключение"}</option>
            {(info?.alphanames ?? []).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={check}
          disabled={busy !== null}
          className="btn-secondary py-2 text-sm"
        >
          {busy === "check" ? "Проверяем…" : "Проверить подключение"}
        </button>
        <input
          value={testPhone}
          onChange={(event) => setTestPhone(event.target.value)}
          placeholder="375291234567"
          inputMode="tel"
          className="field tnum w-48 py-2 text-sm"
        />
        <button
          type="button"
          onClick={test}
          disabled={busy !== null || !testPhone.trim()}
          className="btn-secondary py-2 text-sm"
        >
          {busy === "test" ? "Отправляем…" : "Отправить тестовое SMS"}
        </button>
      </div>
      <p className="text-xs text-brand-400">
        Тестовое SMS уходит с сохранёнными настройками — сначала сохраните токен и включите
        отправку.
      </p>

      {info?.currency && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            info.balance > 0 ? "bg-green-50 text-green-900" : "bg-amber-50 text-amber-900"
          }`}
        >
          <p className="font-medium">
            Баланс: {info.balance} {info.currency}
          </p>
          <p className="mt-0.5">
            {info.alphanames.length
              ? `Доступные альфа-имена: ${info.alphanames.map((entry) => entry.name).join(", ")}`
              : "Одобренных альфа-имён нет — зарегистрируйте его в личном кабинете app.sms.by, иначе отправка может быть отклонена."}
          </p>
        </div>
      )}

      {templateField("codeTemplate", "Шаблон SMS с кодом входа")}
      {templateField("approvedTemplate", "Шаблон «Оптовые цены открыты»")}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn-primary py-2 text-sm">
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        {status && (
          <span
            className={`flex items-center gap-1.5 text-sm ${
              status.tone === "ok" ? "text-green-700" : "text-red-700"
            }`}
            role={status.tone === "error" ? "alert" : undefined}
          >
            {status.tone === "ok" ? (
              <CheckIcon className="h-4 w-4" />
            ) : (
              <AlertIcon className="h-4 w-4" />
            )}
            {status.text}
          </span>
        )}
      </div>
    </div>
  );
}
