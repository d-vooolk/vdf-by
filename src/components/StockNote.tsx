"use client";

import { useStockVisible } from "@/store/account";

export function StockNote({ qty }: { qty: number }) {
  const visible = useStockVisible();
  if (!visible) return null;
  return (
    <p className="tnum mb-1 text-[10px] font-medium text-green-700 sm:text-xs">
      В наличии: {qty} шт.
    </p>
  );
}
