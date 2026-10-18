"use client";

import { CheckIcon, SpinnerIcon, TruckIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Сводка заказа                                                       */
/* ------------------------------------------------------------------ */

export const FORM_ID = "order-form";

export interface OrderSummaryProps {
  subtotal: number;
  deliveryCost: number;
  deliveryPending: boolean;
  total: number;
  methodName?: string;
  currencySymbol: string;
  payment: string[];
  sending: boolean;
}

export function OrderSummary({
  subtotal,
  deliveryCost,
  deliveryPending,
  total,
  methodName,
  currencySymbol,
  payment,
  sending,
}: OrderSummaryProps) {
  return (
    <div className="card p-5">
      <h2 className="mb-4 text-base font-bold text-brand-900">Ваш заказ</h2>

      <dl className="space-y-2.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-brand-500">Товары</dt>
          <dd className="tnum font-medium text-brand-900">
            {formatPrice(subtotal, currencySymbol)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-brand-500">{methodName ?? "Доставка"}</dt>
          <dd className="tnum shrink-0 font-medium text-brand-900">
            {deliveryPending
              ? "после ввода города"
              : deliveryCost === 0
                ? "бесплатно"
                : formatPrice(deliveryCost, currencySymbol)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-brand-100 pt-2.5">
          <dt className="text-base font-bold text-brand-900">Итого</dt>
          <dd className="tnum text-xl font-semibold text-brand-900">
            {formatPrice(total, currencySymbol)}
          </dd>
        </div>
      </dl>

      <button
        type="submit"
        form={FORM_ID}
        disabled={sending}
        className="btn-primary mt-5 w-full"
      >
        {sending ? (
          <>
            <SpinnerIcon className="h-5 w-5 animate-spin" />
            Отправляем…
          </>
        ) : (
          "Оформить заказ"
        )}
      </button>

      <p className="mt-3 flex gap-2 rounded-xl bg-brand-50 p-3 text-xs leading-relaxed text-brand-500">
        <TruckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
        Менеджер перезвонит, подтвердит наличие и согласует время доставки.
        Онлайн-оплаты нет.
      </p>

      {payment.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-brand-900">Оплата</p>
          <ul className="space-y-1 text-xs text-brand-500">
            {payment.map((option) => (
              <li key={option} className="flex gap-1.5">
                <CheckIcon className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                {option}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
