import Link from "next/link";

import { CrmPullNote } from "@/components/admin/CrmPullNote";
import { AddDebtButton, DebtActions } from "@/components/admin/DebtControls";
import { LedgerEntryActions, LedgerEntryButton, RefreshCrmPaymentsButton } from "@/components/admin/LedgerControls";
import { MonthPicker } from "@/components/admin/MonthPicker";
import { cashMonth, expenseCategories, ledgerBalance, rsMonth, type CashIncome } from "@/lib/accounting";
import { requireAdmin } from "@/lib/auth";
import { getSite } from "@/lib/catalog";
import { debtPaidTotal, formatMoney, type Debt, type DebtPayment } from "@/lib/debt-types";
import { listDebts } from "@/lib/debts";
import { formatPrice } from "@/lib/format";

export const metadata = { title: "Бухгалтерия" };

const TABS = [
  { id: "cashflow", label: "Приходно-расходный" },
  { id: "rs", label: "Приход РС" },
  { id: "debts", label: "Долги" },
] as const;

type Tab = (typeof TABS)[number]["id"];
type CashView = "income" | "expenses";

interface PageProps {
  searchParams: Promise<{ tab?: string; month?: string; view?: string; archive?: string }>;
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

function accountingHref(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `/admin/accounting/?${text}` : "/admin/accounting/";
}

function formatDay(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default async function AccountingPage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = await searchParams;
  const tab: Tab = TABS.some((item) => item.id === params.tab) ? (params.tab as Tab) : "cashflow";
  const { year, month } = parseMonth(params.month);
  const monthParam = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : undefined;
  const site = getSite();
  const price = (value: number) => formatPrice(value, site.currencySymbol);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-brand-900">Бухгалтерия</h1>

      <nav className="flex flex-wrap gap-2 border-b border-brand-100 pb-3" aria-label="Разделы бухгалтерии">
        {TABS.map((item) => (
          <Link
            key={item.id}
            href={accountingHref({ tab: item.id === "cashflow" ? undefined : item.id, month: item.id === "debts" ? undefined : monthParam })}
            aria-current={tab === item.id ? "page" : undefined}
            className={`rounded-xl px-4 py-1.5 text-sm font-medium ${
              tab === item.id ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-700"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === "cashflow" && (
        <CashflowTab
          year={year}
          month={month}
          view={params.view === "expenses" ? "expenses" : "income"}
          price={price}
        />
      )}
      {tab === "rs" && <RsTab year={year} month={month} price={price} />}
      {tab === "debts" && <DebtsTab archive={params.archive === "1"} />}
    </div>
  );
}

function TableCard({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
      <p className="tnum border-t border-brand-100 px-4 py-3 text-right text-sm font-semibold text-brand-900">{footer}</p>
    </section>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-brand-400">
        {text}
      </td>
    </tr>
  );
}

const TH = "px-4 py-2 font-medium";
const TD = "px-4 py-2";

function CashflowTab({
  year,
  month,
  view,
  price,
}: {
  year: number;
  month: number;
  view: CashView;
  price: (value: number) => string;
}) {
  const balance = ledgerBalance();
  const cash = cashMonth(year, month);
  const categories = expenseCategories();
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="card px-4 py-2.5">
          <p className="text-xs text-brand-400">Баланс (наличные)</p>
          <p className={`tnum text-xl font-semibold ${balance >= 0 ? "text-green-800" : "text-red-700"}`}>
            {price(balance)}
          </p>
        </div>
        <MonthPicker year={year} month={month} query={view === "expenses" ? { view } : {}} />
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <LedgerEntryButton kind="out" categories={categories} />
          <LedgerEntryButton kind="in" categories={categories} />
        </div>
      </div>

      <div className="inline-flex rounded-xl bg-brand-100 p-1" role="tablist" aria-label="Приход или расход">
        {(
          [
            { id: "income", label: `Приход (наличные) · ${cash.income.length}` },
            { id: "expenses", label: `Расход · ${cash.expenses.length}` },
          ] as const
        ).map((item) => (
          <Link
            key={item.id}
            href={accountingHref({ month: monthKey, view: item.id === "expenses" ? "expenses" : undefined })}
            role="tab"
            aria-selected={view === item.id}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              view === item.id ? "bg-white text-brand-900 shadow-sm" : "text-brand-600"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {view === "income" ? (
        <TableCard footer={`Итого: ${price(cash.incomeTotal)}`}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-brand-400">
              <tr className="border-b border-brand-100">
                <th className={TH}>Дата</th>
                <th className={TH}>Источник</th>
                <th className={`${TH} text-right`}>Сумма</th>
                <th className={TH}>Кто</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100">
              {cash.income.length === 0 && <EmptyRow colSpan={5} text="За этот месяц прихода нет." />}
              {cash.income.map((row) => (
                <tr key={row.key}>
                  <td className={`tnum whitespace-nowrap ${TD} text-brand-500`}>{formatDay(row.date)}</td>
                  <td className={TD}>
                    <IncomeSource row={row} price={price} />
                  </td>
                  <td className={`tnum whitespace-nowrap ${TD} text-right font-semibold text-green-800`}>
                    {price(row.amount)}
                  </td>
                  <td className={`${TD} text-brand-500`}>
                    {(row.source === "crm" ? row.payment.person : row.entry.person) || "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {row.source === "entry" && <LedgerEntryActions entry={row.entry} categories={categories} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      ) : (
        <TableCard footer={`Итого: ${price(cash.expenseTotal)}`}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-brand-400">
              <tr className="border-b border-brand-100">
                <th className={TH}>Дата</th>
                <th className={TH}>Цель</th>
                <th className={TH}>Категория</th>
                <th className={`${TH} text-right`}>Сумма</th>
                <th className={TH}>Изыматель</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100">
              {cash.expenses.length === 0 && <EmptyRow colSpan={6} text="За этот месяц расходов нет." />}
              {cash.expenses.map((entry) => (
                <tr key={entry.id}>
                  <td className={`tnum whitespace-nowrap ${TD} text-brand-500`}>{formatDay(entry.date)}</td>
                  <td className={`${TD} text-brand-900`}>{entry.description}</td>
                  <td className={TD}>
                    {entry.category ? <span className="badge bg-brand-100 text-brand-700">{entry.category}</span> : "—"}
                  </td>
                  <td className={`tnum whitespace-nowrap ${TD} text-right font-semibold text-red-700`}>
                    {price(entry.amount)}
                  </td>
                  <td className={`${TD} text-brand-500`}>{entry.person || "—"}</td>
                  <td className="px-2 py-1 text-right">
                    <LedgerEntryActions entry={entry} categories={categories} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CrmPullNote />
        <RefreshCrmPaymentsButton />
      </div>
    </div>
  );
}

function IncomeSource({ row, price }: { row: CashIncome; price: (value: number) => string }) {
  if (row.source === "crm") {
    return (
      <>
        <Link href={`/admin/orders/${row.payment.orderId}/`} className="text-brand-700 underline">
          Заказ №{row.payment.orderId}
        </Link>{" "}
        <span className="text-brand-900">— {row.payment.employeeName}</span>
        {row.payment.remaining > 0 && (
          <span className="block text-xs text-sky-900">частично, остаток {price(row.payment.remaining)}</span>
        )}
      </>
    );
  }
  if (row.entry.debtId !== null) {
    return <span className="badge bg-amber-100 text-amber-900">{row.entry.description}</span>;
  }
  return <span className="badge bg-sky-100 text-sky-900">Ввод: {row.entry.description}</span>;
}

function RsTab({ year, month, price }: { year: number; month: number; price: (value: number) => string }) {
  const rows = rsMonth(year, month);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="space-y-4">
      <MonthPicker year={year} month={month} query={{ tab: "rs" }} />
      <TableCard footer={`Итого: ${price(total)}`}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-brand-400">
            <tr className="border-b border-brand-100">
              <th className={TH}>Дата</th>
              <th className={TH}>Заказ</th>
              <th className={TH}>Покупатель</th>
              <th className={TH}>Телефон</th>
              <th className={`${TH} text-right`}>Сумма</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-100">
            {rows.length === 0 && (
              <EmptyRow colSpan={5} text="За этот месяц поступлений по РС нет. Отметьте «Оплата по РС» в карточке заказа." />
            )}
            {rows.map((row) => (
              <tr key={row.orderId}>
                <td className={`tnum whitespace-nowrap ${TD} text-brand-500`}>{formatDay(row.date)}</td>
                <td className={`tnum whitespace-nowrap ${TD}`}>
                  <Link href={`/admin/orders/${row.orderId}/`} className="text-brand-700 underline">
                    №{row.orderId}
                  </Link>
                </td>
                <td className={`${TD} text-brand-900`}>{row.name}</td>
                <td className={`tnum whitespace-nowrap ${TD} text-brand-500`}>{row.phone || "—"}</td>
                <td className={`tnum whitespace-nowrap ${TD} text-right font-semibold text-green-800`}>
                  {price(row.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}

function paymentText(payment: DebtPayment, debt: Debt): string {
  return payment.paidCurrency !== debt.currency && payment.rate !== null
    ? `${formatMoney(payment.paidAmount, payment.paidCurrency)} по ${payment.rate}`
    : formatMoney(payment.amount, debt.currency);
}

function DebtAmount({ debt }: { debt: Debt }) {
  const paid = debtPaidTotal(debt);
  if (debt.status === "settled" || paid === 0) {
    return (
      <div>
        <strong className="tnum">{formatMoney(debt.initialAmount, debt.currency)}</strong>
        {debt.payments.length > 0 && (
          <span className="block text-xs text-brand-400">
            {debt.payments.map((payment) => paymentText(payment, debt)).join(" + ")}
          </span>
        )}
      </div>
    );
  }
  return (
    <div>
      <span className="block text-xs text-brand-400">
        Погашено: {debt.payments.map((payment) => paymentText(payment, debt)).join(" + ")} ={" "}
        {formatMoney(paid, debt.currency)}
      </span>
      <strong className="tnum text-red-700">Остаток: {formatMoney(debt.remainingAmount, debt.currency)}</strong>
    </div>
  );
}

function DebtsTab({ archive }: { archive: boolean }) {
  const debts = listDebts(archive);
  const categories = expenseCategories();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <AddDebtButton categories={categories} />
        <Link href={accountingHref({ tab: "debts", archive: archive ? undefined : "1" })} className="btn-secondary py-2 text-sm">
          {archive ? "Активные" : "Архив"}
        </Link>
      </div>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-brand-400">
              <tr className="border-b border-brand-100">
                <th className={TH}>Тип</th>
                <th className={TH}>За что</th>
                <th className={TH}>Категория</th>
                <th className={TH}>Сумма</th>
                <th className={TH}>Создано</th>
                <th className={TH}>{archive ? "Закрыто" : "Действия"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100">
              {debts.length === 0 && <EmptyRow colSpan={6} text={archive ? "Архив пуст" : "Долгов нет"} />}
              {debts.map((debt) => (
                <tr key={debt.id} className="align-top">
                  <td className={`whitespace-nowrap ${TD}`}>
                    {debt.direction === "we_owe" ? (
                      <span className="badge bg-orange-100 text-orange-800">Мы должны</span>
                    ) : (
                      <span className="badge bg-green-100 text-green-800">Нам должны</span>
                    )}
                  </td>
                  <td className={`${TD} text-brand-900`}>{debt.description}</td>
                  <td className={TD}>
                    {debt.category ? <span className="badge bg-brand-100 text-brand-700">{debt.category}</span> : "—"}
                  </td>
                  <td className={`whitespace-nowrap ${TD}`}>
                    <DebtAmount debt={debt} />
                  </td>
                  <td className={`tnum whitespace-nowrap ${TD} text-brand-500`}>{formatDay(debt.createdAt)}</td>
                  <td className={`whitespace-nowrap ${TD}`}>
                    {archive ? (
                      <span className="tnum text-brand-500">{debt.settledAt ? formatDay(debt.settledAt) : "—"}</span>
                    ) : (
                      <DebtActions debt={debt} categories={categories} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
