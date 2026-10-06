import Link from "next/link";

import { AccountingTabs } from "@/components/admin/AccountingTabs";
import { CrmPullNote } from "@/components/admin/CrmPullNote";
import { RefreshCrmPaymentsButton } from "@/components/admin/LedgerControls";
import { MoneyStatusBadge } from "@/components/admin/MoneyStatusBadge";
import {
  isMoneyStatus,
  listStaffOrders,
  MONEY_STATUSES,
  staffOrderCounts,
  type StaffOrderRow,
} from "@/lib/accounting";
import { requireAdmin } from "@/lib/auth";
import { getSite } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";

export const metadata = { title: "Заказы сотрудников — бухгалтерия" };

interface PageProps {
  searchParams: Promise<{ money?: string }>;
}

function formatDay(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function moneyDetails(order: StaffOrderRow, price: (value: number) => string): string {
  const { payment, cancellation } = order.money;
  if (payment) {
    return [formatDay(payment.paidAt), price(payment.amount), payment.person].filter(Boolean).join(" · ");
  }
  if (cancellation) {
    return [
      formatDay(cancellation.cancelledAt),
      cancellation.person,
      cancellation.reason && `причина: ${cancellation.reason}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return order.inCrm ? "в бухгалтерии CRM, ждёт исполнения" : "ещё не передан в CRM";
}

export default async function StaffOrdersPage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = await searchParams;
  const money = isMoneyStatus(params.money) ? params.money : undefined;

  const site = getSite();
  const price = (value: number) => formatPrice(value, site.currencySymbol);
  const counts = staffOrderCounts();
  const total = counts.awaiting + counts.paid + counts.cancelled;
  const orders = listStaffOrders(money);

  const tab = (id: string, label: string, count: number) => {
    const active = (money ?? "") === id;
    return (
      <Link
        key={id || "all"}
        href={`/admin/accounting/staff-orders/${id ? `?money=${id}` : ""}`}
        aria-current={active ? "page" : undefined}
        className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
          active ? "bg-brand-700 text-white" : "bg-white text-brand-600 hover:bg-brand-100"
        }`}
      >
        {label}
        {count > 0 && <span className="tnum ml-1.5 text-xs opacity-70">{count}</span>}
      </Link>
    );
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h1 className="text-xl font-semibold text-brand-900">Бухгалтерия</h1>
        <AccountingTabs active="staff-orders" />
        <p className="max-w-3xl text-sm text-brand-500">
          Заказы сотрудников попадают сюда, когда отмечены «Выполнен», и уходят в бухгалтерию CRM.
          Там их исполняют — заказ становится оплаченным — или отменяют.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-wrap gap-2">
          {tab("", "Все", total)}
          {MONEY_STATUSES.map((entry) => tab(entry.id, entry.name, counts[entry.id]))}
        </div>
        <div className="ml-auto">
          <RefreshCrmPaymentsButton />
        </div>
      </div>

      <CrmPullNote />

      {orders.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          {money ? "Таких заказов нет." : "Выполненных заказов сотрудников пока нет."}
        </p>
      ) : (
        <div className="card divide-y divide-brand-100 overflow-hidden">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/admin/orders/${order.id}/`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-brand-50"
            >
              <span className="tnum w-12 shrink-0 text-xs text-brand-300">№{order.id}</span>
              <MoneyStatusBadge status={order.money.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-brand-900">
                  {order.name} <span className="tnum font-normal text-brand-400">{order.phone}</span>
                </span>
                <span className="block truncate text-xs text-brand-400">
                  заказ от {formatDay(order.createdAt)} · {moneyDetails(order, price)}
                </span>
              </span>
              {order.status !== "done" && (
                <span className="badge bg-brand-100 text-brand-500">снят с «Выполнен»</span>
              )}
              <span className="tnum shrink-0 text-sm font-semibold text-brand-900">{price(order.total)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
