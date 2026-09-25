import type { Metadata } from "next";
import Link from "next/link";

import { CustomerControls } from "@/components/admin/CustomerControls";
import { getSite } from "@/lib/catalog";
import { listCustomers, WHOLESALE_LABELS, type WholesaleStatus } from "@/lib/customers";
import { formatPrice } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { smsConfigured } from "@/lib/sms";

export const metadata: Metadata = { title: "Покупатели" };

const TABS = [
  { id: "pending", label: "Заявки на опт" },
  { id: "approved", label: "Оптовики" },
  { id: "rejected", label: "Отклонённые" },
  { id: "all", label: "Все покупатели" },
] as const;

type Tab = (typeof TABS)[number]["id"];

function date(timestamp: number | null): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_TONE: Record<WholesaleStatus, string> = {
  none: "bg-brand-100 text-brand-600",
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-50 text-red-700",
};

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const { tab: raw } = await searchParams;
  const tab: Tab = TABS.some((entry) => entry.id === raw) ? (raw as Tab) : "pending";
  const customers = listCustomers(tab);
  const site = getSite();
  const counts = Object.fromEntries(
    TABS.map((entry) => [entry.id, listCustomers(entry.id).length]),
  ) as Record<Tab, number>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">Покупатели</h1>
        <p className="mt-1 text-sm text-brand-500">
          Кабинеты покупателей. Заявки на опт проверяйте звонком: после «Подтвердить опт» номеру
          открываются оптовые цены в каталоге, корзине и заказах.
        </p>
        {!smsConfigured() && (
          <p className="mt-2 text-sm text-red-700">
            SMS не настроены: в .env на сервере нет SMS_BY_TOKEN — коды входа не отправляются.
          </p>
        )}
      </div>

      <nav className="flex flex-wrap gap-2">
        {TABS.map((entry) => (
          <Link
            key={entry.id}
            href={`/admin/customers/?tab=${entry.id}`}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
              tab === entry.id ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-700"
            }`}
          >
            {entry.label} <span className="tnum">{counts[entry.id]}</span>
          </Link>
        ))}
      </nav>

      {customers.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">Здесь пока никого нет.</p>
      ) : (
        <ul className="space-y-3">
          {customers.map((customer) => (
            <li key={customer.id} className="card grid gap-4 p-4 lg:grid-cols-[1fr_20rem]">
              <div className="space-y-1.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-brand-900">{customer.name}</span>
                  <span className={`badge ${STATUS_TONE[customer.wholesaleStatus]}`}>
                    {WHOLESALE_LABELS[customer.wholesaleStatus]}
                  </span>
                  <span className="text-xs text-brand-400">
                    {customer.kind === "wholesale" ? "регистрировался как оптовик" : "регистрировался как розница"}
                  </span>
                </div>
                <p>
                  <a
                    href={`tel:+${customer.phone}`}
                    className="tnum font-medium text-brand-700 underline"
                  >
                    {formatPhone(customer.phone)}
                  </a>
                </p>
                {customer.address && <p className="text-brand-600">Адрес: {customer.address}</p>}
                <p className="text-xs text-brand-400">
                  Зарегистрирован: {date(customer.createdAt)} · Последний вход:{" "}
                  {date(customer.lastLoginAt)} · Согласие на обработку данных:{" "}
                  {date(customer.consentAt)}
                  {customer.reviewedAt ? ` · Проверен: ${date(customer.reviewedAt)}` : ""}
                </p>
                <p className="text-xs text-brand-500">
                  Заказов: {customer.orders}
                  {customer.orders > 0 &&
                    ` на ${formatPrice(customer.ordersTotal, site.currencySymbol)}, последний ${date(customer.lastOrderAt)}`}
                  {customer.orders > 0 && (
                    <>
                      {" · "}
                      <Link
                        href={`/admin/orders/?q=${customer.phone.slice(-9)}`}
                        className="text-brand-700 underline"
                      >
                        открыть заказы
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <CustomerControls
                id={customer.id}
                status={customer.wholesaleStatus}
                note={customer.adminNote}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
