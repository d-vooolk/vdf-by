import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountProfile } from "@/components/AccountProfile";
import { getCustomer } from "@/lib/customer-auth";
import { formatPhone } from "@/lib/phone";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Личный кабинет",
    description: "Данные покупателя.",
    path: "/account/",
    noIndex: true,
  });
}

const WHOLESALE_NOTES = {
  none: null,
  pending: {
    tone: "bg-amber-50 text-amber-900",
    text: "Заявка на оптовые цены принята. Менеджер позвонит, чтобы уточнить детали, — после подтверждения здесь и в каталоге откроются оптовые цены.",
  },
  approved: {
    tone: "bg-green-50 text-green-900",
    text: "Вы оптовый покупатель: в каталоге и в корзине действуют оптовые цены.",
  },
  rejected: {
    tone: "bg-brand-50 text-brand-700",
    text: "Оптовые цены по заявке не подтверждены. Если это ошибка — позвоните нам.",
  },
};

const PRICE_LABELS = {
  none: "Розничные",
  pending: "Розничные, заявка на опт на проверке",
  approved: "Оптовые",
  rejected: "Розничные",
};

function date(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function AccountDataPage() {
  const customer = await getCustomer();
  if (!customer) redirect("/account/login/");

  const company = customer.kind === "wholesale";
  const note = WHOLESALE_NOTES[customer.wholesaleStatus];
  const facts = [
    { label: company ? "Компания или ФИО" : "ФИО", value: customer.name },
    { label: "Телефон", value: formatPhone(customer.phone), numeric: true },
    { label: "Тип покупателя", value: company ? "Оптовый покупатель" : "Частный покупатель" },
    { label: "Цены", value: PRICE_LABELS[customer.wholesaleStatus] },
    ...(customer.address ? [{ label: "Адрес магазина или мастерской", value: customer.address }] : []),
    { label: "В магазине с", value: date(customer.createdAt), numeric: true },
  ];

  return (
    <>
      {note && <p className={`rounded-xl px-4 py-3 text-sm ${note.tone}`}>{note.text}</p>}

      <section className="card p-5">
        <h2 className="text-lg font-semibold text-brand-900">{company ? "Данные компании" : "Данные покупателя"}</h2>
        <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs text-brand-400">{fact.label}</dt>
              <dd className={`mt-0.5 text-sm font-medium text-brand-900 ${fact.numeric ? "tnum" : ""}`}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-brand-900">Изменить данные</h2>
        <AccountProfile
          name={customer.name}
          address={customer.address}
          kind={customer.kind}
          wholesaleStatus={customer.wholesaleStatus}
        />
      </section>
    </>
  );
}
