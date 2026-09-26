"use client";

import { useEffect, useState } from "react";

import { getRatesAction } from "@/app/admin/actions";
import { NumberInput } from "@/components/admin/form-parts";
import {
  convertToByn,
  describeRate,
  FOREIGN_CURRENCIES,
  type CurrencyRates,
  type ForeignCurrency,
  type MoneySource,
  type Rounding,
} from "@/lib/currency";
import { formatPrice } from "@/lib/format";

let ratesRequest: Promise<CurrencyRates> | null = null;

function loadRates(): Promise<CurrencyRates> {
  ratesRequest ??= getRatesAction().catch((error) => {
    ratesRequest = null;
    throw error;
  });
  return ratesRequest;
}

type Currency = "BYN" | ForeignCurrency;

interface MoneyFieldProps {
  label: string;
  hint?: string;
  value: number | null;
  source: MoneySource | null;
  rounding: Rounding;
  currencySymbol: string;
  placeholder?: string;
  onChange: (value: number | null, source: MoneySource | null) => void;
}

export function MoneyField({
  label,
  hint,
  value,
  source,
  rounding,
  currencySymbol,
  placeholder = "не указана",
  onChange,
}: MoneyFieldProps) {
  const [currency, setCurrency] = useState<Currency>(source?.currency ?? "BYN");
  const [amount, setAmount] = useState<number | null>(source?.amount ?? null);
  const [linked, setLinked] = useState(source !== null);
  const [rates, setRates] = useState<CurrencyRates | null>(null);
  const [ratesFailed, setRatesFailed] = useState(false);

  const rate = currency === "BYN" ? null : rates?.[currency] ?? null;

  const emit = (next: { currency: Currency; amount: number | null; linked: boolean }, by = rates) => {
    if (next.currency === "BYN") return;
    const entry = by?.[next.currency];
    if (next.amount === null) {
      onChange(null, null);
      return;
    }
    if (!entry) return;
    const byn = convertToByn(next.amount, entry.rate, rounding);
    onChange(byn, next.linked ? { amount: next.amount, currency: next.currency } : null);
  };

  const pick = async (next: Currency) => {
    setCurrency(next);
    if (next === "BYN") {
      onChange(value, null);
      return;
    }
    let current = rates;
    if (!current) {
      try {
        current = await loadRates();
        setRates(current);
        setRatesFailed(false);
      } catch {
        setRatesFailed(true);
        return;
      }
    }
    emit({ currency: next, amount, linked }, current);
  };

  useEffect(() => {
    if (currency === "BYN" || rates) return;
    let alive = true;
    loadRates()
      .then((loaded) => alive && setRates(loaded))
      .catch(() => alive && setRatesFailed(true));
    return () => {
      alive = false;
    };
  }, [currency, rates]);

  let note = hint ?? "";
  if (currency !== "BYN") {
    if (rate) {
      const shown = value === null ? "—" : formatPrice(value, currencySymbol);
      note = `= ${shown} по курсу НБРБ ${describeRate(currency, rate)}. ${
        linked
          ? "Пересчитывается каждый день, сумма в валюте не меняется"
          : "Сохранится в рублях и дальше от курса не зависит"
      }`;
    } else if (ratesFailed) {
      note = "Не удалось получить курс НБРБ — попробуйте ещё раз или введите сумму в рублях";
    } else {
      note = "Загружаем курс НБРБ…";
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="label mb-0">{label}</span>
        <span className="flex overflow-hidden rounded-lg border border-brand-200 text-xs font-medium">
          {(["BYN", ...Object.keys(FOREIGN_CURRENCIES)] as Currency[]).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => pick(code)}
              className={`px-2 py-0.5 ${
                currency === code ? "bg-brand-700 text-white" : "text-brand-500 hover:bg-brand-50"
              }`}
            >
              {code === "BYN" ? currencySymbol : FOREIGN_CURRENCIES[code]}
            </button>
          ))}
        </span>
      </div>

      {currency === "BYN" ? (
        <NumberInput value={value} onChange={(next) => onChange(next, null)} placeholder={placeholder} />
      ) : (
        <NumberInput
          value={amount}
          onChange={(next) => {
            setAmount(next);
            emit({ currency, amount: next, linked });
          }}
          placeholder={`сумма в ${FOREIGN_CURRENCIES[currency]}`}
        />
      )}

      {currency !== "BYN" && (
        <label className="mt-1.5 flex items-center gap-2 text-xs text-brand-700">
          <input
            type="checkbox"
            checked={linked}
            onChange={(event) => {
              setLinked(event.target.checked);
              emit({ currency, amount, linked: event.target.checked });
            }}
            className="h-3.5 w-3.5 rounded border-brand-300 text-brand-700"
          />
          Привязать к курсу — пересчитывать каждый день
        </label>
      )}

      {note && <span className="mt-1 block text-xs text-brand-400">{note}</span>}
    </div>
  );
}
