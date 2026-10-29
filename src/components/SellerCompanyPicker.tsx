"use client";

import { useEffect, useState } from "react";

import { Combobox } from "@/components/Combobox";
import { AlertIcon, SpinnerIcon } from "@/components/icons";
import { pluralize } from "@/lib/format";

export interface SellerCompany {
  id: number;
  name: string;
  phone: string;
  address: string;
  orders: number;
}

interface SellerCompanyPickerProps {
  value: SellerCompany | null;
  onChange: (company: SellerCompany | null) => void;
}

const EMPTY_DRAFT = { name: "", phone: "+375 ", address: "", consent: false };

export function SellerCompanyPicker({ value, onChange }: SellerCompanyPickerProps) {
  const [companies, setCompanies] = useState<SellerCompany[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/seller/companies/", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { companies?: SellerCompany[]; error?: string }) => {
        if (cancelled) return;
        if (data.companies) setCompanies(data.companies);
        else setLoadError(data.error ?? "Не удалось загрузить список компаний");
      })
      .catch(() => !cancelled && setLoadError("Не удалось загрузить список компаний"));
    return () => {
      cancelled = true;
    };
  }, []);

  const create = async () => {
    setError("");
    if (draft.name.trim().length < 2) return setError("Укажите название компании или ФИО");
    if (draft.address.trim().length < 5) return setError("Укажите адрес магазина или мастерской");
    if (!draft.consent) return setError("Нужно согласие компании на обработку персональных данных");
    setBusy(true);
    try {
      const response = await fetch("/api/seller/companies/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await response.json().catch(() => ({}))) as { company?: SellerCompany; error?: string };
      if (!data.company) return setError(data.error ?? "Не удалось создать компанию");
      const company = data.company;
      setCompanies((current) => [company, ...(current ?? []).filter((entry) => entry.id !== company.id)]);
      onChange(company);
      setCreating(false);
      setDraft(EMPTY_DRAFT);
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="card mb-5 space-y-3 border-sky-200 bg-sky-50/40 p-4">
      <legend className="px-1 text-sm font-semibold text-brand-900">Компания-оптовик</legend>
      <p className="text-xs leading-relaxed text-brand-500">
        Заказ запишется на выбранную компанию: попадёт в её историю заказов и в счётчик в админке. Без
        компании заказ уйдёт на ваши данные.
      </p>

      {loadError ? (
        <p className="flex items-center gap-1.5 text-sm text-red-700">
          <AlertIcon className="h-4 w-4 shrink-0" />
          {loadError}
        </p>
      ) : companies === null ? (
        <p className="flex items-center gap-2 text-sm text-brand-500">
          <SpinnerIcon className="h-4 w-4 animate-spin" />
          Загружаем компании…
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Combobox
            value={value ? String(value.id) : ""}
            onChange={(id) => onChange(companies.find((entry) => String(entry.id) === id) ?? null)}
            options={companies.map((entry) => ({
              value: String(entry.id),
              label: entry.name,
              hint: `${entry.phone} · ${pluralize(entry.orders, "заказ", "заказа", "заказов")}`,
            }))}
            placeholder="Найти компанию по названию"
            emptyText="Такой компании нет — создайте её"
            className="min-w-0 flex-1"
          />
          {!creating && (
            <button type="button" onClick={() => setCreating(true)} className="btn-secondary">
              Создать компанию
            </button>
          )}
        </div>
      )}

      {value && (
        <p className="text-sm text-brand-700">
          {value.phone}
          {value.address ? ` · ${value.address}` : ""}
        </p>
      )}

      {creating && (
        <div className="space-y-3 rounded-xl border border-brand-100 bg-white p-4">
          <p className="text-sm font-semibold text-brand-900">Новая компания</p>
          <label className="block">
            <span className="label">Название компании или ФИО</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              autoComplete="off"
              className="field"
            />
          </label>
          <label className="block">
            <span className="label">Номер телефона</span>
            <input
              type="tel"
              inputMode="tel"
              value={draft.phone}
              onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
              placeholder="+375 29 123-45-67"
              autoComplete="off"
              className="field tnum"
            />
          </label>
          <label className="block">
            <span className="label">Адрес магазина или мастерской</span>
            <input
              value={draft.address}
              onChange={(event) => setDraft({ ...draft, address: event.target.value })}
              autoComplete="off"
              className="field"
            />
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-brand-500">
            <input
              type="checkbox"
              checked={draft.consent}
              onChange={(event) => setDraft({ ...draft, consent: event.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-brand-200 text-brand-700 focus:ring-brand-600"
            />
            <span>
              Компания согласилась на обработку её данных (название или ФИО, телефон, адрес) для оформления и
              выполнения заказов. Оптовые цены откроются ей сразу, без проверки.
            </span>
          </label>
          {error && (
            <p className="flex items-start gap-1.5 text-sm text-red-700" role="alert">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void create()} disabled={busy} className="btn-primary">
              {busy && <SpinnerIcon className="h-4 w-4 animate-spin" />}
              Создать и выбрать
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setError("");
              }}
              className="btn-secondary"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </fieldset>
  );
}
