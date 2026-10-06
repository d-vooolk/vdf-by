import Link from "next/link";

import { MoneyStatusBadge } from "@/components/admin/MoneyStatusBadge";
import { OrderStatusBadge } from "@/components/admin/OrderStatusBadge";
import { moneyStatuses } from "@/lib/accounting";
import { getSite } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUSES } from "@/lib/order-types";
import { listOrders, orderStatusCounts } from "@/lib/orders";

export const metadata = { title: "Заказы" };

const PER_PAGE = 40;

interface PageProps {
  searchParams: Promise<{ kind?: string; status?: string; q?: string; page?: string }>;
}

export default async function OrdersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const status = params.status ?? "";
  const query = params.q ?? "";
  const staff = params.kind === "staff";

  const site = getSite();
  const counts = orderStatusCounts(staff);
  const newCounts = {
    regular: orderStatusCounts(false).new ?? 0,
    staff: orderStatusCounts(true).new ?? 0,
  };
  const { rows, total } = listOrders({
    status: status || undefined,
    query,
    staff,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  });

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const money = moneyStatuses(staff ? rows.map((order) => order.id) : []);

  const kindTab = (kind: "regular" | "staff", label: string) => {
    const active = staff === (kind === "staff");
    const count = newCounts[kind];
    return (
      <Link
        key={kind}
        href={`/admin/orders/${kind === "staff" ? "?kind=staff" : ""}`}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2 rounded-xl px-4 py-1.5 text-sm font-medium ${
          active ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-700"
        }`}
      >
        {label}
        {count > 0 && (
          <span
            className={`badge tnum ${active ? "bg-white text-brand-800" : "bg-amber-400 text-amber-950"}`}
            title="Новые заказы"
          >
            {count}
          </span>
        )}
      </Link>
    );
  };

  const tab = (id: string, label: string, count?: number) => {
    const active = status === id;
    const search = new URLSearchParams();
    if (staff) search.set("kind", "staff");
    if (id) search.set("status", id);
    if (query) search.set("q", query);

    return (
      <Link
        key={id || "all"}
        href={`/admin/orders/${search.toString() ? `?${search}` : ""}`}
        aria-current={active ? "page" : undefined}
        className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
          active ? "bg-brand-700 text-white" : "bg-white text-brand-600 hover:bg-brand-100"
        }`}
      >
        {label}
        {count !== undefined && count > 0 && (
          <span className="tnum ml-1.5 text-xs opacity-70">{count}</span>
        )}
      </Link>
    );
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-brand-900">
        Заказы{" "}
        <span className="tnum text-base font-medium text-brand-400">{total}</span>
      </h1>

      <nav className="flex flex-wrap gap-2" aria-label="Вид заказов">
        {kindTab("regular", "Обычные заказы")}
        {kindTab("staff", "Заказы сотрудников")}
      </nav>

      <div className="flex flex-wrap gap-2">
        {tab("", "Все")}
        {ORDER_STATUSES.map((entry) =>
          tab(entry.id, entry.name, counts[entry.id]),
        )}
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        {staff && <input type="hidden" name="kind" value="staff" />}
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Телефон, имя или адрес"
          className="field max-w-72 py-2 text-sm"
        />
        <button type="submit" className="btn-secondary py-2 text-sm">
          Найти
        </button>
        {query && (
          <Link href={pageLink(1, staff, status, "")} className="btn-ghost py-2 text-sm">
            Сбросить
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">
          {query || status ? "Ничего не нашлось." : staff ? "Заказов сотрудников пока нет." : "Заказов пока нет."}
        </p>
      ) : (
        <div className="card divide-y divide-brand-100 overflow-hidden">
          {rows.map((order) => (
            <Link
              key={order.id}
              href={`/admin/orders/${order.id}/`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-brand-50"
            >
              <span className="tnum w-12 shrink-0 text-xs text-brand-300">
                №{order.id}
              </span>
              <OrderStatusBadge status={order.status} />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-brand-900">
                  {order.name}{" "}
                  <span className="tnum font-normal text-brand-400">
                    {order.phone}
                  </span>
                </span>
                <span className="block truncate text-xs text-brand-400">
                  {formatDate(order.createdAt)} · {order.items.length} поз. ·{" "}
                  {order.deliveryName || "доставка не указана"}
                </span>
              </span>

              {staff && (order.status === "done" || money.get(order.id) !== "awaiting") && (
                <MoneyStatusBadge status={money.get(order.id) ?? "awaiting"} />
              )}
              {order.notes.length > 0 && (
                <span
                  className="badge bg-amber-100 text-amber-900"
                  title={order.notes.join("; ")}
                >
                  проверить
                </span>
              )}
              {!order.telegramSent && (
                <span
                  className="badge bg-brand-100 text-brand-500"
                  title="Не ушёл в Telegram — заказ сохранён только здесь"
                >
                  не отправлен
                </span>
              )}

              <span className="tnum shrink-0 text-sm font-semibold text-brand-900">
                {formatPrice(order.total, site.currencySymbol)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="Страницы">
          {page > 1 && (
            <Link
              href={pageLink(page - 1, staff, status, query)}
              className="btn-secondary py-2 text-sm"
            >
              ← Назад
            </Link>
          )}
          <span className="tnum text-sm text-brand-400">
            {page} из {pages}
          </span>
          {page < pages && (
            <Link
              href={pageLink(page + 1, staff, status, query)}
              className="btn-secondary py-2 text-sm"
            >
              Вперёд →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

function pageLink(page: number, staff: boolean, status: string, query: string): string {
  const search = new URLSearchParams();
  if (staff) search.set("kind", "staff");
  if (status) search.set("status", status);
  if (query) search.set("q", query);
  if (page > 1) search.set("page", String(page));
  const text = search.toString();
  return `/admin/orders/${text ? `?${text}` : ""}`;
}

/** Дата в привычном виде. Часовой пояс — сервера, он же минский. */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
