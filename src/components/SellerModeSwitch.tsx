"use client";

import { useState } from "react";

import { SELLER_MODES, type SellerMode } from "@/lib/seller-mode";
import { useAccount } from "@/store/account";

export function SellerModeSwitch({ className = "" }: { className?: string }) {
  const current = useAccount((state) => state.customer?.sellerMode ?? null);
  const setSellerMode = useAccount((state) => state.setSellerMode);
  const [pending, setPending] = useState<SellerMode | null>(null);

  if (!current && !pending) return null;
  const shown = pending ?? current;

  const choose = async (mode: SellerMode) => {
    if (mode === shown) return;
    setPending(mode);
    try {
      await setSellerMode(mode);
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      role="group"
      aria-label="Режим продавца"
      className={`flex shrink-0 rounded-control border border-brand-200 bg-white p-0.5 text-xs ${
        pending ? "opacity-60" : ""
      } ${className}`}
    >
      {SELLER_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          aria-pressed={mode.id === shown}
          disabled={pending !== null}
          onClick={() => choose(mode.id)}
          className={`rounded-control px-2 py-0.5 font-medium transition-colors ${
            mode.id === shown ? "bg-brand-900 text-white" : "text-brand-600 hover:bg-brand-50"
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
