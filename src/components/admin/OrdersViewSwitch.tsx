"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SpinnerIcon } from "@/components/icons";
import { ORDERS_VIEW_COOKIE, ORDERS_VIEWS, writeAdminCookie, type OrdersView } from "@/lib/admin-prefs";

export function OrdersViewSwitch({ view }: { view: OrdersView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      {pending && <SpinnerIcon className="h-4 w-4 animate-spin text-brand-500" />}
      <div role="group" aria-label="Вид заказов" className="flex rounded-control border border-brand-200 p-0.5">
        {ORDERS_VIEWS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === view}
            disabled={pending}
            onClick={() => {
              writeAdminCookie(ORDERS_VIEW_COOKIE, entry.id);
              startTransition(() => router.refresh());
            }}
            className={`rounded-control px-3 py-1.5 text-sm ${
              entry.id === view ? "bg-brand-900 font-semibold text-white" : "text-brand-600 hover:bg-brand-50"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}
