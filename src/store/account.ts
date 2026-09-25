"use client";

import { create } from "zustand";

export interface AccountCustomer {
  name: string;
  phone: string;
  kind: "retail" | "wholesale";
  address: string;
  wholesaleStatus: "none" | "pending" | "approved" | "rejected";
}

interface AccountState {
  status: "unknown" | "loading" | "guest" | "customer";
  customer: AccountCustomer | null;
  wholesale: Record<string, number> | null;
  load: (force?: boolean) => Promise<void>;
  reset: () => void;
}

export const useAccount = create<AccountState>()((set, get) => ({
  status: "unknown",
  customer: null,
  wholesale: null,
  load: async (force = false) => {
    const current = get().status;
    if (!force && (current === "loading" || current === "guest" || current === "customer")) return;
    set({ status: "loading" });
    try {
      const response = await fetch("/api/account/", { cache: "no-store" });
      const data = (await response.json()) as {
        customer: AccountCustomer | null;
        wholesale?: Record<string, number> | null;
      };
      set({
        status: data.customer ? "customer" : "guest",
        customer: data.customer,
        wholesale: data.wholesale ?? null,
      });
    } catch {
      set({ status: "guest", customer: null, wholesale: null });
    }
  },
  reset: () => set({ status: "guest", customer: null, wholesale: null }),
}));

export function useWholesalePrice(key: string): number | null {
  return useAccount((state) => state.wholesale?.[key] ?? null);
}
