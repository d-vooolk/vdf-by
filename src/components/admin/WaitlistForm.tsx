"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  addWaitlistAction,
  searchWaitlistProductsAction,
  type WaitlistProductOption,
} from "@/app/admin/waitlist-actions";
import { Combobox } from "@/components/Combobox";
import { AlertIcon, SpinnerIcon } from "@/components/icons";

interface WaitlistCompany {
  id: number;
  name: string;
  phone: string;
}

type Who = "company" | "person";

const EMPTY = { companyId: "", name: "", phone: "+375 ", qty: 1, note: "" };

export function WaitlistForm({ companies }: { companies: WaitlistCompany[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [who, setWho] = useState<Who>("person");
  const [form, setForm] = useState(EMPTY);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<WaitlistProductOption[]>([]);
  const [product, setProduct] = useState<WaitlistProductOption | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (product || trimmed.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchWaitlistProductsAction(trimmed).then((options) => {
        if (!cancelled) setFound(options);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, product]);

  const submit = () => {
    if (who === "company" && !form.companyId) {
      setProblems(["Выберите компанию"]);
      return;
    }
    startTransition(async () => {
      const result = await addWaitlistAction({
        customerId: who === "company" ? Number(form.companyId) || null : null,
        name: who === "person" ? form.name : "",
        phone: who === "person" ? form.phone : "",
        productId: product?.id ?? null,
        productTitle: product?.title ?? query,
        qty: form.qty,
        note: form.note,
      });
      setProblems(result.problems);
      if (!result.ok) return;
      setForm({ ...EMPTY, companyId: who === "company" ? form.companyId : "" });
      setProduct(null);
      setQuery("");
      setFound([]);
      router.refresh();
    });
  };

  return (
    <form
      className="card space-y-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-brand-900">Добавить в лист ожидания:</span>
        {(["person", "company"] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setWho(entry)}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
              who === entry ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-700"
            }`}
          >
            {entry === "person" ? "Человек" : "Компания-оптовик"}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {who === "company" ? (
          <label className="block md:col-span-2">
            <span className="label">Компания</span>
            <Combobox
              value={form.companyId}
              onChange={(companyId) => setForm({ ...form, companyId })}
              options={companies.map((company) => ({
                value: String(company.id),
                label: company.name,
                hint: company.phone,
              }))}
              placeholder="Найти компанию"
              emptyText="Нет такой компании среди оптовиков"
            />
          </label>
        ) : (
          <>
            <label className="block">
              <span className="label">Имя</span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="field"
              />
            </label>
            <label className="block">
              <span className="label">Телефон</span>
              <input
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="+375 29 123-45-67"
                className="field tnum"
              />
            </label>
          </>
        )}

        <div className="relative md:col-span-2">
          <label className="block">
            <span className="label">Товар</span>
            <input
              value={product ? product.title : query}
              onChange={(event) => {
                setProduct(null);
                setQuery(event.target.value);
              }}
              placeholder="Название или артикул"
              autoComplete="off"
              className="field"
            />
          </label>
          {!product && query.trim().length >= 2 && found.length > 0 && (
            <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-brand-200 bg-white py-1 shadow-card-hover">
              {found.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => setProduct(option)}
                    className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50"
                  >
                    <span className="text-brand-900">{option.title}</span>
                    <span className="shrink-0 text-xs text-brand-400">
                      {option.sku}
                      {option.inStock ? " · в наличии" : " · нет"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!product && query.trim().length >= 2 && (
            <p className="mt-1 text-xs text-brand-400">
              Выберите товар из списка — тогда раздел подсветит запись, когда он появится. Можно оставить
              свой текст, если товара нет в каталоге.
            </p>
          )}
        </div>

        <label className="block">
          <span className="label">Количество</span>
          <input
            type="number"
            min={1}
            value={form.qty}
            onChange={(event) => setForm({ ...form, qty: Number(event.target.value) || 1 })}
            className="field tnum"
          />
        </label>
        <label className="block">
          <span className="label">Заметка</span>
          <input
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            placeholder="Цвет, сторона, когда обещали"
            className="field"
          />
        </label>
      </div>

      {problems.length > 0 && (
        <p className="flex items-start gap-1.5 text-sm text-red-700" role="alert">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {problems.join(". ")}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
        Добавить
      </button>
    </form>
  );
}
