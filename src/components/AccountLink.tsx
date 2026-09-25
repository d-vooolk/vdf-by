"use client";

import Link from "next/link";
import { useEffect } from "react";

import { UserIcon } from "@/components/icons";
import { useAccount } from "@/store/account";

export function AccountLink({ compact = false }: { compact?: boolean }) {
  const status = useAccount((state) => state.status);
  const customer = useAccount((state) => state.customer);
  const load = useAccount((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  const signedIn = status === "customer" && customer;
  const wholesale = customer?.wholesaleStatus === "approved";
  const href = signedIn ? "/account/" : "/account/login/";
  const label = signedIn ? customer.name.split(/\s+/)[0] || "Кабинет" : "Войти";

  if (compact) {
    return (
      <Link
        href={href}
        aria-label={signedIn ? "Личный кабинет" : "Войти"}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-brand-700 transition-colors hover:bg-brand-50 lg:hidden"
      >
        <UserIcon className="h-5 w-5" />
        {wholesale && (
          <span className="absolute -top-0.5 -right-0.5 rounded-full bg-green-600 px-1 text-[9px] font-semibold text-white">
            опт
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 font-medium text-brand-600 transition-colors hover:text-brand-900"
    >
      <UserIcon className="h-4 w-4" />
      {label}
      {wholesale && (
        <span className="badge bg-green-50 px-1.5 py-0 text-[11px] text-green-800">опт</span>
      )}
    </Link>
  );
}
