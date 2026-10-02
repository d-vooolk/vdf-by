"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { LogOutIcon, PackageIcon, SpinnerIcon, UserIcon } from "@/components/icons";
import { useAccount } from "@/store/account";

const LINKS = [
  { href: "/account/", label: "Данные", icon: UserIcon },
  { href: "/account/orders/", label: "Заказы", icon: PackageIcon },
];

const ITEM_CLASS =
  "flex shrink-0 items-center gap-2.5 rounded-control px-3 py-2.5 text-sm font-medium transition-colors";

export function AccountNav({ orderCount }: { orderCount: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const logout = async () => {
    setLeaving(true);
    try {
      await fetch("/api/account/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      useAccount.getState().reset();
      router.push("/");
      router.refresh();
    } catch {
      setLeaving(false);
    }
  };

  return (
    <nav aria-label="Личный кабинет" className="card flex gap-1 overflow-x-auto p-2 lg:flex-col">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`${ITEM_CLASS} ${
              active ? "bg-brand-100 text-brand-900" : "text-brand-600 hover:bg-brand-50 hover:text-brand-900"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
            {href === "/account/orders/" && orderCount > 0 && (
              <span className="tnum ml-auto text-xs text-brand-400">{orderCount}</span>
            )}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={logout}
        disabled={leaving}
        className={`${ITEM_CLASS} text-brand-600 hover:bg-red-50 hover:text-red-700 lg:mt-2`}
      >
        {leaving ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <LogOutIcon className="h-5 w-5" />}
        Выход
      </button>
    </nav>
  );
}
