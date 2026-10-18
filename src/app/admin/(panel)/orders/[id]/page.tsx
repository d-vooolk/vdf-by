import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderControls } from "@/components/admin/OrderControls";
import { OrderItems } from "@/components/admin/OrderItems";
import { MoneyStatusBadge } from "@/components/admin/MoneyStatusBadge";
import { orderMoney } from "@/lib/accounting";
import { getSite } from "@/lib/catalog";
import { crmSyncState } from "@/lib/crm-sync";
import { formatPrice } from "@/lib/format";
import { getOrder } from "@/lib/orders";
import { smsConfigured } from "@/lib/sms";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return { title: `Заказ №${id}` };
}

export default async function OrderPage({ params }: PageProps) {
  const { id } = await params;
  const order = getOrder(Number(id));
  if (!order) notFound();

  const site = getSite();
  const price = (value: number) => formatPrice(value, site.currencySymbol);
  const crm = order.staff ? crmSyncState(order.id) : null;
  const money = order.staff ? orderMoney(order.id) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/orders/" className="btn-ghost py-2 text-sm">
          ← К заказам
        </Link>
        <h1 className="text-xl font-semibold text-brand-900">
          Заказ №{order.id}
        </h1>
        <span className="text-sm text-brand-400">
          {new Date(order.createdAt).toLocaleString("ru-RU")}
        </span>
        {order.staff && (
          <span className="badge bg-sky-100 text-sky-800">внутренняя покупка сотрудника</span>
        )}
        {order.editedAt && (
          <span className="text-sm text-brand-400">
            · состав изменён {new Date(order.editedAt).toLocaleString("ru-RU")}
          </span>
        )}
      </div>

      {crm?.queued ? (
        <p className="rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {crm.configured
            ? "Ждёт отправки в CRM — повтор каждые 5 минут."
            : "CRM не подключена (CRM_URL и CRM_INTEGRATION_KEY в .env) — заказ ждёт в очереди."}
          {crm.queued.lastError && (
            <span className="mt-1 block text-xs text-amber-800">
              Попыток: {crm.queued.attempts}. Последняя ошибка: {crm.queued.lastError}
            </span>
          )}
        </p>
      ) : crm?.sentAt ? (
        <p className="text-sm text-green-800">
          Передан в бухгалтерию CRM {new Date(crm.sentAt).toLocaleString("ru-RU")}
        </p>
      ) : null}

      {money && (crm?.sentAt || money.status !== "awaiting") && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-brand-700">
          <MoneyStatusBadge status={money.status} />
          {money.payments.length > 0 &&
            money.payments
              .map((payment) => `${new Date(payment.paidAt).toLocaleDateString("ru-RU")}, ${price(payment.amount)}`)
              .join("; ")}
          {money.status === "partial" && (
            <span className="font-medium text-sky-900">
              {money.payments.length > 1 && `оплачено ${price(money.paidTotal)}, `}остаток {price(money.remaining)}
            </span>
          )}
          {money.cancellation &&
            [
              new Date(money.cancellation.cancelledAt).toLocaleDateString("ru-RU"),
              money.cancellation.person,
              money.cancellation.reason && `причина: ${money.cancellation.reason}`,
            ]
              .filter(Boolean)
              .join(", ")}
          <Link href="/admin/orders/?kind=staff" className="underline">
            все заказы сотрудников
          </Link>
        </p>
      )}

      {/* Расхождения, замеченные при приёме заявки. Показываем сразу и
          заметно: именно они портят разговор с покупателем. */}
      {order.notes.length > 0 && (
        <div className="rounded-card border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Проверьте перед звонком
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-amber-800">
            {order.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </div>
      )}

      {!order.telegramSent && (
        <p className="rounded-card border border-brand-200 bg-brand-50 p-4 text-sm text-brand-600">
          Этот заказ не ушёл в Telegram — проверьте бота в разделе{" "}
          <Link href="/admin/settings/telegram/" className="font-medium text-brand-900 underline">
            Настройки → Telegram
          </Link>
          . Сам заказ сохранён полностью.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* ---------------------------- Состав --------------------------- */}
        <OrderItems
          orderId={order.id}
          items={order.items}
          subtotal={order.subtotal}
          deliveryName={order.deliveryName}
          deliveryCost={order.deliveryCost}
          total={order.total}
          totalManual={order.totalManual}
          currencySymbol={site.currencySymbol}
          stockTaken={order.status === "done"}
        />

        {/* ---------------------------- Клиент --------------------------- */}
        <div className="space-y-5">
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-bold text-brand-900">Покупатель</h2>

            <dl className="space-y-2.5 text-sm">
              <Row label="Имя">{order.name}</Row>
              <Row label="Телефон">
                <a
                  href={`tel:+${order.phoneDigits}`}
                  className="tnum font-semibold text-brand-700 hover:underline"
                >
                  {order.phone}
                </a>
              </Row>
              {order.email && (
                <Row label="Email">
                  <a href={`mailto:${order.email}`} className="text-brand-700 hover:underline">
                    {order.email}
                  </a>
                </Row>
              )}
              {order.address && <Row label="Адрес">{order.address}</Row>}
              {order.comment && <Row label="Комментарий">{order.comment}</Row>}
              <Row label="Согласие на обработку ПД">
                {order.consentAt
                  ? new Date(order.consentAt).toLocaleString("ru-RU", {
                      timeZone: "Europe/Minsk",
                    })
                  : "не запрашивалось"}
              </Row>
            </dl>

            {(order.referer || order.ip) && (
              <p className="mt-3 border-t border-brand-100 pt-3 text-xs text-brand-300">
                {order.referer && <>Пришёл со страницы: {order.referer}<br /></>}
                {order.ip && <>Адрес: {order.ip}</>}
              </p>
            )}
          </section>

          <OrderControls
            id={order.id}
            status={order.status}
            note={order.adminNote}
            reviewSmsAt={order.reviewSmsAt}
            smsReady={smsConfigured()}
          />
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-brand-400">{label}</dt>
      <dd className="text-brand-900">{children}</dd>
    </div>
  );
}
