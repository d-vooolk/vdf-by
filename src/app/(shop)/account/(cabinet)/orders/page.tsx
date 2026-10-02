import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSite } from "@/lib/catalog";
import { getCustomer } from "@/lib/customer-auth";
import { customerOrders } from "@/lib/customers";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUSES } from "@/lib/order-types";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Мои заказы",
    description: "История заказов покупателя.",
    path: "/account/orders/",
    noIndex: true,
  });
}

const STATUS_NAMES = Object.fromEntries(ORDER_STATUSES.map((status) => [status.id, status.name]));

function date(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function AccountOrdersPage() {
  const customer = await getCustomer();
  if (!customer) redirect("/account/login/");

  const site = getSite();
  const orders = customerOrders(customer.phone);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-brand-900">
        Заказы <span className="tnum text-brand-400">{orders.length}</span>
      </h2>
      {orders.length === 0 ? (
        <p className="card p-8 text-center text-sm text-brand-400">
          Заказов пока нет. <Link href="/catalog/" className="text-brand-700 underline">Перейти в каталог</Link>
        </p>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id} className="card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-brand-900">
                  Заказ №{order.id}{" "}
                  <span className="text-sm font-normal text-brand-400">от {date(order.createdAt)}</span>
                </p>
                <p className="text-sm">
                  <span className="badge bg-brand-100 text-brand-700">
                    {STATUS_NAMES[order.status] ?? order.status}
                  </span>
                  {order.wholesale && <span className="badge ml-1.5 bg-green-50 text-green-800">опт</span>}
                </p>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-brand-600">
                {order.items.map((item, index) => (
                  <li key={`${order.id}-${index}`} className="flex justify-between gap-3">
                    <span className="min-w-0">
                      {item.title}
                      {item.options ? ` (${item.options})` : ""} × {item.qty}
                    </span>
                    <span className="tnum shrink-0">{formatPrice(item.sum, site.currencySymbol)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex justify-between border-t border-brand-100 pt-2 text-sm font-semibold text-brand-900">
                <span>{order.deliveryName}</span>
                <span className="tnum">{formatPrice(order.total, site.currencySymbol)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
