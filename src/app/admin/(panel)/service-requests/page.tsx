import type { Metadata } from "next";
import Link from "next/link";

import { ServiceRequestToggle } from "@/components/admin/ServiceRequestToggle";
import { listServiceRequests } from "@/lib/service";

export const metadata: Metadata = { title: "Заявки на установку" };

function date(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ServiceRequestsPage() {
  const requests = listServiceRequests();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">Заявки на установку</h1>
        <p className="mt-1 text-sm text-brand-500">
          Заявки «Рассчитать установку» со страниц товаров и со страницы «Установка». Каждая
          дублируется в Telegram.
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="card p-10 text-center text-sm text-brand-400">Заявок пока нет.</p>
      ) : (
        <ul className="card divide-y divide-brand-100">
          {requests.map((request) => (
            <li
              key={request.id}
              className={`flex flex-wrap items-start gap-3 px-4 py-3 ${request.done ? "opacity-60" : ""}`}
            >
              <span className="tnum w-12 shrink-0 text-xs text-brand-300">№{request.id}</span>
              <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                <p className="font-medium text-brand-900">
                  {request.name}{" "}
                  <a href={`tel:${request.phone.replace(/[^\d+]/g, "")}`} className="tnum font-normal text-brand-600 underline">
                    {request.phone}
                  </a>
                </p>
                {request.productTitle && (
                  <p className="text-brand-600">
                    Товар:{" "}
                    {request.productId ? (
                      <Link href={`/admin/products/${request.productId}/`} className="underline">
                        {request.productTitle}
                      </Link>
                    ) : (
                      request.productTitle
                    )}
                  </p>
                )}
                {request.car && <p className="text-brand-600">Авто: {request.car}</p>}
                {request.comment && <p className="text-brand-500">{request.comment}</p>}
                <p className="text-xs text-brand-400">
                  {date(request.createdAt)}
                  {request.telegramSent ? "" : " · не ушла в Telegram"}
                </p>
              </div>
              <ServiceRequestToggle id={request.id} done={request.done} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
