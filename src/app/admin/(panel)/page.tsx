import Link from "next/link";

import { OrderStatusBadge } from "@/components/admin/OrderStatusBadge";
import { getSite } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { listOrders, orderStats } from "@/lib/orders";
import { countOutOfStock, listCategoriesBrief, listProducts } from "@/lib/store";

/** Сводка: с чего начинается рабочий день — сколько новых заказов и что в каталоге. */
export default function DashboardPage() {
  const site = getSite();
  const stats = orderStats();
  const categories = listCategoriesBrief();
  const products = listProducts({ limit: 5 });
  const recent = listOrders({ limit: 6 });
  const outOfStock = countOutOfStock();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-brand-900">Сводка</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Новых заказов"
          value={String(stats.newCount)}
          hint={stats.newCount > 0 ? "ждут звонка" : "всё обработано"}
          href="/admin/orders/?status=new"
          accent={stats.newCount > 0}
        />
        <Stat
          label="Заказов за сутки"
          value={String(stats.todayCount)}
          href="/admin/orders/"
        />
        <Stat
          label="Продажи за неделю"
          value={formatPrice(stats.weekTotal, site.currencySymbol)}
          hint="без отменённых"
        />
        <Stat
          label="Товаров в каталоге"
          value={String(products.total)}
          hint={`${categories.length} раздел(ов)`}
          href="/admin/products/"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------- Заказы ------------------------- */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-brand-100 px-4 py-3">
            <h2 className="text-sm font-bold text-brand-900">Последние заказы</h2>
            <Link
              href="/admin/orders/"
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              Все заказы
            </Link>
          </div>

          {recent.rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-brand-400">
              Заказов пока нет.
            </p>
          ) : (
            <ul className="divide-y divide-brand-100">
              {recent.rows.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.id}/`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-brand-50"
                  >
                    <OrderStatusBadge status={order.status} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-brand-900">
                        {order.name}
                      </span>
                      <span className="block truncate text-xs text-brand-400">
                        {order.phone} · {order.items.length} поз.
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-sm font-semibold text-brand-900">
                      {formatPrice(order.total, site.currencySymbol)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ------------------------- Каталог ------------------------ */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-brand-100 px-4 py-3">
            <h2 className="text-sm font-bold text-brand-900">Разделы каталога</h2>
            <Link
              href="/admin/products/new/"
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              + Новый товар
            </Link>
          </div>

          <ul className="divide-y divide-brand-100">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/admin/products/?category=${category.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-brand-50"
                >
                  <span className="text-sm font-medium text-brand-900">
                    {category.name}
                  </span>
                  <span className="tnum text-sm text-brand-400">
                    {category.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {outOfStock > 0 && (
            <p className="border-t border-brand-100 px-4 py-3 text-xs text-brand-400">
              <Link href="/admin/out-of-stock/" className="underline">
                Нет в наличии товаров: <b className="tnum">{outOfStock}</b>
              </Link>
              . Кнопки заказа у них нет.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface StatProps {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  accent?: boolean;
}

function Stat({ label, value, hint, href, accent }: StatProps) {
  const body = (
    <>
      <p className="text-xs font-medium text-brand-400">{label}</p>
      <p
        className={`tnum mt-1 text-2xl font-semibold ${
          accent ? "text-amber-600" : "text-brand-900"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-brand-400">{hint}</p>}
    </>
  );

  return href ? (
    <Link href={href} className="card block p-4 transition-colors hover:bg-brand-50">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}
