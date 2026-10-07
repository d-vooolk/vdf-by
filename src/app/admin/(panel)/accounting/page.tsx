import Link from "next/link";

import { CrmPullNote } from "@/components/admin/CrmPullNote";
import {
  DeleteWriteoffButton,
  RefreshCrmPaymentsButton,
  WriteoffForm,
} from "@/components/admin/LedgerControls";
import { ledgerBalance, ledgerMonth } from "@/lib/accounting";
import { requireAdmin } from "@/lib/auth";
import { getSite } from "@/lib/catalog";
import { formatPrice, pluralize } from "@/lib/format";

export const metadata = { title: "Бухгалтерия" };

const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

function parseMonth(value: string | undefined): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) return { year, month };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function monthHref(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `/admin/accounting/?month=${key}`;
}

function formatDay(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export default async function AccountingPage({ searchParams }: PageProps) {
  const admin = await requireAdmin();
  const { year, month } = parseMonth((await searchParams).month);
  const site = getSite();
  const price = (value: number) => formatPrice(value, site.currencySymbol);

  const balance = ledgerBalance();
  const ledger = ledgerMonth(year, month);
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">Бухгалтерия</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-500">
          Заказы сотрудников, оплаченные в бухгалтерии CRM: как только заказ исполнен на вкладке
          «VDF», его сумма приходит сюда. Удалённый в CRM расход снимает поступление. Деньги не из CRM
          вносятся вручную кнопкой «Внести средства».
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-brand-400">Баланс</p>
          <p
            className={`tnum mt-1 text-2xl font-semibold ${
              balance >= 0 ? "text-green-800" : "text-red-700"
            }`}
          >
            {price(balance)}
          </p>
          <p className="mt-1 text-xs text-brand-400">поступления минус списания за всё время</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-brand-400">Поступило за месяц</p>
          <p className="tnum mt-1 text-2xl font-semibold text-brand-900">{price(ledger.incomeTotal)}</p>
          <p className="mt-1 text-xs text-brand-400">
            {pluralize(new Set(ledger.payments.map((payment) => payment.orderId)).size, "заказ", "заказа", "заказов")} из CRM
            {ledger.deposits.length > 0 &&
              `, ${pluralize(ledger.deposits.length, "внесение", "внесения", "внесений")} на ${price(ledger.depositTotal)}`}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-brand-400">Списано за месяц</p>
          <p className="tnum mt-1 text-2xl font-semibold text-brand-900">{price(ledger.writeoffTotal)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <nav className="flex items-center gap-1" aria-label="Месяц">
          <Link href={monthHref(year, month - 1)} className="btn-ghost px-3 py-2 text-sm" aria-label="Предыдущий месяц">
            ←
          </Link>
          <span className="min-w-36 text-center text-sm font-medium text-brand-900">
            {MONTHS[month - 1]} {year}
          </span>
          {!isCurrentMonth && (
            <Link href={monthHref(year, month + 1)} className="btn-ghost px-3 py-2 text-sm" aria-label="Следующий месяц">
              →
            </Link>
          )}
        </nav>
        <div className="ml-auto flex flex-wrap items-start gap-2">
          <RefreshCrmPaymentsButton />
          <WriteoffForm kind="in" defaultPerson={admin.login} />
          <WriteoffForm kind="out" defaultPerson={admin.login} />
        </div>
      </div>

      <CrmPullNote />

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="border-b border-brand-100 px-4 py-3 text-sm font-bold text-brand-900">
            Поступления из CRM
          </h2>
          {ledger.payments.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-brand-400">За этот месяц поступлений нет.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-brand-400">
                  <tr className="border-b border-brand-100">
                    <th className="px-4 py-2 font-medium">Дата</th>
                    <th className="px-4 py-2 font-medium">Заказ</th>
                    <th className="px-4 py-2 font-medium">Сотрудник</th>
                    <th className="px-4 py-2 font-medium">Изыматель в CRM</th>
                    <th className="px-4 py-2 text-right font-medium">Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-100">
                  {ledger.payments.map((payment, index) => (
                    <tr key={`${payment.orderId}-${index}`}>
                      <td className="tnum whitespace-nowrap px-4 py-2 text-brand-500">{formatDay(payment.paidAt)}</td>
                      <td className="tnum whitespace-nowrap px-4 py-2">
                        <Link href={`/admin/orders/${payment.orderId}/`} className="text-brand-700 underline">
                          №{payment.orderId}
                        </Link>
                        {payment.remaining > 0 && (
                          <span className="block text-xs text-sky-900">частично, остаток {price(payment.remaining)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-brand-900">{payment.employeeName}</td>
                      <td className="px-4 py-2 text-brand-500">{payment.person || "—"}</td>
                      <td className="tnum whitespace-nowrap px-4 py-2 text-right font-semibold text-green-800">
                        {price(payment.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="tnum border-t border-brand-100 px-4 py-3 text-right text-sm font-semibold text-brand-900">
            Итого: {price(ledger.incomeTotal - ledger.depositTotal)}
          </p>
        </section>

        <section className="card overflow-hidden">
          <h2 className="border-b border-brand-100 px-4 py-3 text-sm font-bold text-brand-900">Внесения</h2>
          {ledger.deposits.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-brand-400">За этот месяц внесений нет.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-brand-400">
                  <tr className="border-b border-brand-100">
                    <th className="px-4 py-2 font-medium">Дата</th>
                    <th className="px-4 py-2 font-medium">Откуда</th>
                    <th className="px-4 py-2 text-right font-medium">Сумма</th>
                    <th className="px-4 py-2 font-medium">Вноситель</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-100">
                  {ledger.deposits.map((deposit) => (
                    <tr key={deposit.id}>
                      <td className="tnum whitespace-nowrap px-4 py-2 text-brand-500">{formatDay(deposit.date)}</td>
                      <td className="px-4 py-2 text-brand-900">{deposit.description}</td>
                      <td className="tnum whitespace-nowrap px-4 py-2 text-right font-semibold text-green-800">
                        {price(deposit.amount)}
                      </td>
                      <td className="px-4 py-2 text-brand-500">{deposit.person}</td>
                      <td className="px-2 py-1 text-right">
                        <DeleteWriteoffButton id={deposit.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="tnum border-t border-brand-100 px-4 py-3 text-right text-sm font-semibold text-brand-900">
            Итого: {price(ledger.depositTotal)}
          </p>
        </section>

        <section className="card overflow-hidden">
          <h2 className="border-b border-brand-100 px-4 py-3 text-sm font-bold text-brand-900">Списания</h2>
          {ledger.writeoffs.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-brand-400">За этот месяц списаний нет.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-brand-400">
                  <tr className="border-b border-brand-100">
                    <th className="px-4 py-2 font-medium">Дата</th>
                    <th className="px-4 py-2 font-medium">Цель</th>
                    <th className="px-4 py-2 text-right font-medium">Сумма</th>
                    <th className="px-4 py-2 font-medium">Изыматель</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-100">
                  {ledger.writeoffs.map((writeoff) => (
                    <tr key={writeoff.id}>
                      <td className="tnum whitespace-nowrap px-4 py-2 text-brand-500">{formatDay(writeoff.date)}</td>
                      <td className="px-4 py-2 text-brand-900">{writeoff.description}</td>
                      <td className="tnum whitespace-nowrap px-4 py-2 text-right font-semibold text-red-700">
                        {price(writeoff.amount)}
                      </td>
                      <td className="px-4 py-2 text-brand-500">{writeoff.person}</td>
                      <td className="px-2 py-1 text-right">
                        <DeleteWriteoffButton id={writeoff.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="tnum border-t border-brand-100 px-4 py-3 text-right text-sm font-semibold text-brand-900">
            Итого: {price(ledger.writeoffTotal)}
          </p>
        </section>
      </div>
    </div>
  );
}
