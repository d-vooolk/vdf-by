"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  createDebtAction,
  currencyRatesAction,
  deleteDebtAction,
  payDebtAction,
  updateDebtAction,
} from "@/app/admin/accounting-actions";
import { AdminModal, ModalActions } from "@/components/admin/AdminModal";
import { Field, NumberInput, Problems } from "@/components/admin/form-parts";
import { CategoryInput } from "@/components/admin/LedgerControls";
import { PencilIcon, PlusIcon, SpinnerIcon, TrashIcon } from "@/components/icons";
import {
  cashAmountInByn,
  DEBT_CURRENCIES,
  type Debt,
  type DebtCurrency,
  debtPaymentNeedsRate,
  debtPaymentOptions,
  debtReduction,
  formatMoney,
  type ForeignCurrency,
} from "@/lib/debt-types";

function useSubmit() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problems, setProblems] = useState<string[]>([]);
  const run = (action: () => Promise<{ ok: boolean; problems: string[] }>, onDone: () => void) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setProblems(result.problems);
        return;
      }
      setProblems([]);
      onDone();
      router.refresh();
    });
  };
  return { pending, problems, run };
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl bg-brand-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-lg px-3 py-1 text-sm font-medium ${
            value === option.value ? "bg-white text-brand-900 shadow-sm" : "text-brand-600"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function AddDebtButton({ categories }: { categories: string[] }) {
  const [open, setOpen] = useState(false);
  const { pending, problems, run } = useSubmit();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<DebtCurrency>("BYN");
  const [companyOwes, setCompanyOwes] = useState(true);
  const [category, setCategory] = useState("");

  const show = () => {
    setDescription("");
    setAmount(null);
    setCurrency("BYN");
    setCompanyOwes(true);
    setCategory("");
    setOpen(true);
  };
  const close = () => setOpen(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(
      () =>
        createDebtAction({
          description,
          amount,
          currency,
          direction: companyOwes ? "we_owe" : "owed_to_us",
          category: companyOwes ? category : "",
        }),
      close,
    );
  };

  return (
    <>
      <button type="button" onClick={show} className="btn-primary py-2 text-sm">
        <PlusIcon className="h-4 w-4" />
        Добавить запись
      </button>
      {open && (
        <AdminModal title="Добавить долг" onClose={close}>
          <form onSubmit={submit} className="space-y-4">
            <Problems items={problems} />
            <Field label="За что" required>
              <input
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Например: запчасти у поставщика"
                maxLength={300}
                className="field"
                autoFocus
              />
            </Field>
            <Field label="Сумма" required>
              <NumberInput value={amount} onChange={setAmount} placeholder="0,00" />
            </Field>
            <Field label="Валюта долга">
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value as DebtCurrency)}
                className="field"
              >
                {DEBT_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <span className="label">Тип</span>
              <Segmented
                value={companyOwes ? "we_owe" : "owed_to_us"}
                onChange={(value) => setCompanyOwes(value === "we_owe")}
                options={[
                  { value: "we_owe", label: "Мы должны" },
                  { value: "owed_to_us", label: "Нам должны" },
                ]}
              />
            </div>
            {companyOwes && (
              <Field label="Категория" required hint="Погашения уйдут в расход кассы с этой категорией">
                <CategoryInput value={category} onChange={setCategory} categories={categories} />
              </Field>
            )}
            <ModalActions pending={pending} submitLabel="Добавить" onCancel={close} />
          </form>
        </AdminModal>
      )}
    </>
  );
}

function EditDebtModal({ debt, categories, onClose }: { debt: Debt; categories: string[]; onClose: () => void }) {
  const { pending, problems, run } = useSubmit();
  const [description, setDescription] = useState(debt.description);
  const [amount, setAmount] = useState<number | null>(debt.initialAmount);
  const [category, setCategory] = useState(debt.category);
  const hasPayments = debt.payments.length > 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => updateDebtAction(debt.id, { description, amount, category }), onClose);
  };

  return (
    <AdminModal title="Редактировать долг" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Problems items={problems} />
        <Field label="За что" required>
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={300}
            className="field"
          />
        </Field>
        <Field
          label={`Сумма (${debt.currency})`}
          required
          hint={hasPayments ? "По долгу уже есть погашения — сумму изменить нельзя" : undefined}
        >
          <NumberInput value={amount} onChange={setAmount} disabled={hasPayments} />
        </Field>
        {debt.direction === "we_owe" && (
          <Field label="Категория" required>
            <CategoryInput value={category} onChange={setCategory} categories={categories} />
          </Field>
        )}
        <ModalActions pending={pending} submitLabel="Сохранить" onCancel={onClose} />
      </form>
    </AdminModal>
  );
}

function PayDebtModal({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const { pending, problems, run } = useSubmit();
  const [payCurrency, setPayCurrency] = useState<DebtCurrency>(debt.currency);
  const [amount, setAmount] = useState<number | null>(debt.remainingAmount);
  const [manualRate, setManualRate] = useState<number | null | undefined>(undefined);
  const [rates, setRates] = useState<Record<ForeignCurrency, number | null> | null>(null);
  const [loadingRates, startLoadingRates] = useTransition();

  useEffect(() => {
    let alive = true;
    currencyRatesAction().then((fresh) => {
      if (alive) setRates(fresh);
    });
    return () => {
      alive = false;
    };
  }, []);

  const foreign: ForeignCurrency | null =
    payCurrency !== "BYN" ? payCurrency : debt.currency !== "BYN" ? debt.currency : null;
  const officialRate = foreign && rates?.[foreign] ? Math.round(rates[foreign]! * 10000) / 10000 : null;
  const rate = manualRate === undefined ? officialRate : manualRate;
  const needsRate = debtPaymentNeedsRate(debt.currency, payCurrency);
  const converts = payCurrency !== debt.currency;
  const remaining = debt.remainingAmount;
  const paid = amount ?? 0;
  const reduce = debtReduction(debt.currency, payCurrency, paid, rate);
  const tooMuch = reduce > remaining + 0.01;
  const cash = cashAmountInByn(payCurrency, paid, rate);

  const reloadRates = () => {
    startLoadingRates(async () => {
      setRates(await currencyRatesAction());
      setManualRate(undefined);
    });
  };

  const changeCurrency = (next: DebtCurrency) => {
    setPayCurrency(next);
    setAmount(null);
    setManualRate(undefined);
  };

  const fullAmount = () => {
    if (!converts) return remaining;
    if (!rate) return null;
    return payCurrency === "BYN"
      ? Math.round(remaining * rate * 100) / 100
      : Math.ceil((remaining / rate) * 100) / 100;
  };

  const cashNote =
    debt.direction === "we_owe"
      ? `В кассе будет расход ${formatMoney(cash, "BYN")}.`
      : payCurrency !== "BYN"
        ? `Валюта уйдёт в капитал CRM: в кассе будет приход ${formatMoney(cash, "BYN")} по курсу и расход «Отчисление в капитал» на ту же сумму.`
        : `В кассе будет приход ${formatMoney(cash, "BYN")}.`;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => payDebtAction(debt.id, { amount, currency: payCurrency, rate: needsRate ? rate : null }), onClose);
  };

  return (
    <AdminModal title="Исполнить долг" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Problems items={problems} />
        <div className="text-sm text-brand-500">
          {debt.description}
          <div className="mt-1">
            Остаток: <strong className="text-brand-900">{formatMoney(remaining, debt.currency)}</strong>
          </div>
        </div>
        <div>
          <span className="label">Чем платят</span>
          <Segmented
            value={payCurrency}
            onChange={changeCurrency}
            options={debtPaymentOptions(debt.currency).map((code) => ({ value: code, label: code }))}
          />
        </div>
        {foreign && needsRate && (
          <Field label={`Курс, BYN за 1 ${foreign}`} required>
            <div className="flex gap-2">
              <NumberInput value={rate} onChange={setManualRate} placeholder="0,0000" />
              <button type="button" onClick={reloadRates} disabled={loadingRates} className="btn-ghost shrink-0 px-3 text-sm">
                {loadingRates && <SpinnerIcon className="h-4 w-4 animate-spin" />}
                НБРБ
              </button>
            </div>
          </Field>
        )}
        <div>
          <span className="label">Сумма погашения ({payCurrency})</span>
          <div className="flex gap-2">
            <NumberInput value={amount} onChange={setAmount} placeholder="0,00" />
            <button
              type="button"
              onClick={() => setAmount(fullAmount())}
              disabled={converts && !rate}
              className="btn-secondary shrink-0 px-3 text-sm"
            >
              Весь остаток
            </button>
          </div>
          {converts && reduce > 0 && (
            <p className="mt-1.5 text-xs text-brand-500">
              Долг уменьшится на <strong>{formatMoney(Math.min(reduce, remaining), debt.currency)}</strong>
            </p>
          )}
          {cash > 0 && <p className="mt-1.5 text-xs text-brand-400">{cashNote}</p>}
        </div>
        {tooMuch && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            Сумма больше остатка долга
          </p>
        )}
        <ModalActions
          pending={pending}
          submitLabel="Провести"
          disabled={paid <= 0 || tooMuch || (needsRate && !rate)}
          onCancel={onClose}
        />
      </form>
    </AdminModal>
  );
}

export function DebtActions({ debt, categories }: { debt: Debt; categories: string[] }) {
  const [modal, setModal] = useState<"pay" | "edit" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { pending, problems, run } = useSubmit();
  const close = () => setModal(null);

  if (debt.status !== "active") return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <button type="button" onClick={() => setModal("pay")} className="btn-primary px-3 py-1 text-xs">
        Исполнить
      </button>
      <button
        type="button"
        onClick={() => setModal("edit")}
        aria-label="Редактировать"
        title="Редактировать"
        className="btn-ghost px-2 py-1"
      >
        <PencilIcon className="h-3.5 w-3.5" />
      </button>
      {debt.payments.length === 0 &&
        (confirming ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteDebtAction(debt.id), () => setConfirming(false))}
              className="btn-primary bg-red-700 px-2 py-1 text-xs hover:bg-red-800"
            >
              Удалить
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="btn-ghost px-2 py-1 text-xs">
              Отмена
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label="Удалить"
            title="Удалить"
            className="btn-ghost px-2 py-1 text-red-700 hover:bg-red-50"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        ))}
      {problems.length > 0 && <span className="w-full text-xs text-red-700">{problems.join("; ")}</span>}
      {modal === "pay" && <PayDebtModal debt={debt} onClose={close} />}
      {modal === "edit" && <EditDebtModal debt={debt} categories={categories} onClose={close} />}
    </span>
  );
}
