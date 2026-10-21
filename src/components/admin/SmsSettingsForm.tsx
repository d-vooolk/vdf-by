"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { checkSmsAction, saveSmsSettingsAction, sendTestSmsAction } from "@/app/admin/settings-actions";
import { EditableCard, EditableField, EditableSwitch, type SaveResult } from "@/components/admin/Editable";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons";
import type { SmsConnection } from "@/lib/sms";

interface Templates {
  codeTemplate: string;
  approvedTemplate: string;
  reviewTemplate: string;
  readyTemplate: string;
}

type SmsState = { enabled: boolean; alphanameId: string; alphaname: string } & Templates;

const TEMPLATE_LABELS: Record<keyof Templates, string> = {
  codeTemplate: "Шаблон SMS с кодом входа",
  approvedTemplate: "Шаблон «Оптовые цены открыты»",
  reviewTemplate: "Шаблон «Просьба об отзыве» — кнопка в выполненном заказе",
  readyTemplate: "Шаблон «Заказ готов к выдаче» — предлагается при смене статуса",
};

function AlphanamePicker({
  draft,
  onChange,
}: {
  draft: { id: string; name: string };
  onChange: (next: { id: string; name: string }) => void;
}) {
  const [info, setInfo] = useState<SmsConnection | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await checkSmsAction("");
      if (result.ok) setInfo(result.info);
      else setError(result.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={check} disabled={busy} className="btn-secondary py-2 text-sm">
        {busy && <SpinnerIcon className="h-4 w-4 animate-spin" />}
        {info ? "Проверить заново" : "Проверить подключение и получить список"}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {info && (
        <>
          <p className={`text-sm ${info.balance > 0 ? "text-green-700" : "text-amber-800"}`}>
            Баланс: {info.balance} {info.currency}
            {!info.alphanames.length &&
              " · одобренных альфа-имён нет — зарегистрируйте его в личном кабинете app.sms.by"}
          </p>
          <select
            value={draft.id}
            onChange={(event) =>
              onChange({
                id: event.target.value,
                name: info.alphanames.find((entry) => entry.id === event.target.value)?.name ?? "",
              })
            }
            className="field py-2 text-sm"
          >
            <option value="">Без альфа-имени</option>
            {info.alphanames.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

export function SmsSettingsForm({
  initial,
  tokenMask,
  defaults,
  variables,
}: {
  initial: SmsState;
  tokenMask: string;
  defaults: Templates;
  variables: Record<keyof Templates, Array<[string, string]>>;
}) {
  const router = useRouter();
  const [state, setState] = useState<SmsState>(initial);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const persist = async (changes: Partial<SmsState & { token: string }>): Promise<SaveResult> => {
    const { token = "", ...fields } = changes;
    const next = { ...state, ...fields };
    const result = await saveSmsSettingsAction({ ...next, token });
    if (!result.ok) return result.problems;
    setState(next);
    router.refresh();
    return [];
  };

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const result = await sendTestSmsAction(testPhone, "");
      setStatus(
        result.ok
          ? { tone: "ok", text: `Тестовое SMS отправлено на ${testPhone}` }
          : { tone: "error", text: result.problems.join(" ") },
      );
    } finally {
      setTesting(false);
    }
  };

  const hint = (key: keyof Templates) =>
    variables[key].map(([name, description]) => `${name} — ${description}`).join(" · ");

  return (
    <div className="space-y-5">
      <section className="card px-5 py-2">
        <EditableSwitch
          label="Отправка SMS"
          description="Коды входа в личный кабинет и уведомление о подтверждении опта"
          checked={state.enabled}
          onSave={(enabled) => persist({ enabled })}
        />
        <EditableField
          label="API-токен sms.by"
          hint="Личный кабинет app.sms.by → Настройки → API"
          value={tokenMask}
          secret
          type="password"
          mono
          placeholder="0e11a2c8810eaec4c20f86b5caa394eb"
          onSave={(token) => (token.trim() ? persist({ token }) : Promise.resolve(["Вставьте токен"]))}
        />
        <div className="py-3">
          <EditableCard
            value={{ id: state.alphanameId, name: state.alphaname }}
            view={(value) => (
              <div>
                <p className="text-xs font-medium text-brand-400">Альфа-имя (отправитель)</p>
                <p className={`mt-0.5 text-sm ${value.name ? "text-brand-900" : "text-brand-300"}`}>
                  {value.name || "не выбрано"}
                </p>
              </div>
            )}
            editor={(draft, change) => <AlphanamePicker draft={draft} onChange={change} />}
            onSave={(next) => persist({ alphanameId: next.id, alphaname: next.name })}
          />
        </div>
      </section>

      <section className="card px-5 py-2">
        {(Object.keys(TEMPLATE_LABELS) as Array<keyof Templates>).map((key) => (
          <EditableField
            key={key}
            label={TEMPLATE_LABELS[key]}
            hint={hint(key)}
            value={state[key] || defaults[key]}
            placeholder={defaults[key]}
            multiline
            onSave={(value) => persist({ [key]: value } as Partial<SmsState>)}
          />
        ))}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-sm font-bold text-brand-900">Тестовое SMS</h2>
        <div className="flex flex-wrap items-center gap-2">
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
            disabled={testing || !testPhone.trim()}
            className="btn-secondary py-2 text-sm"
          >
            {testing ? "Отправляем…" : "Отправить"}
          </button>
        </div>
        <p className="text-xs text-brand-400">Уходит с сохранёнными настройками: нужны токен и включённая отправка.</p>
        {status && (
          <p
            className={`flex items-center gap-1.5 text-sm ${status.tone === "ok" ? "text-green-700" : "text-red-700"}`}
            role={status.tone === "error" ? "alert" : undefined}
          >
            {status.tone === "ok" ? <CheckIcon className="h-4 w-4" /> : <AlertIcon className="h-4 w-4" />}
            {status.text}
          </p>
        )}
      </section>
    </div>
  );
}
