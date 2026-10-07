"use client";

import { useTransition } from "react";

import { setProductsViewAction } from "@/app/admin/actions";
import { SpinnerIcon } from "@/components/icons";
import { PRODUCTS_VIEWS, type ProductsView } from "@/lib/admin-prefs";

export function ProductsViewSwitch({ view }: { view: ProductsView }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      {pending && <SpinnerIcon className="h-4 w-4 animate-spin text-brand-500" />}
      <div role="group" aria-label="Режим списка" className="flex rounded-control border border-brand-200 p-0.5">
        {PRODUCTS_VIEWS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === view}
            disabled={pending}
            onClick={() => startTransition(() => setProductsViewAction(entry.id))}
            className={`rounded-control px-3 py-1.5 text-sm ${
              entry.id === view
                ? "bg-brand-900 font-semibold text-white"
                : "text-brand-600 hover:bg-brand-50"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}
