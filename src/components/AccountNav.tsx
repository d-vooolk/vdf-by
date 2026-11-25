"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { DocumentIcon, LogOutIcon, PackageIcon, SpinnerIcon, UserIcon } from "@/components/icons";
import { useAccount } from "@/store/account";

const LINKS = [
  { href: "/account/", label: "Данные", icon: UserIcon },
  { href: "/account/orders/", label: "Заказы", icon: PackageIcon },
];

const WIKI_LINK = { href: "/account/wiki/", label: "WIKI", icon: DocumentIcon };

const ITEM_CLASS =
  "flex min-w-0 flex-col items-center gap-1 rounded-control px-1 py-2 text-xs font-medium transition-colors lg:flex-row lg:gap-2.5 lg:px-3 lg:py-2.5 lg:text-sm";

export function AccountNav({ orderCount, wiki }: { orderCount: number; wiki: boolean }) {
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
    <nav aria-label="Личный кабинет" className="card grid auto-cols-fr grid-flow-col gap-1 p-2 lg:flex lg:flex-col">
      {(wiki ? [...LINKS, WIKI_LINK] : LINKS).map(({ href, label, icon: Icon }) => {
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
            <Icon className="h-5 w-5 shrink-0" />
            <span className="flex max-w-full items-center gap-1.5 lg:flex-1">
              <span className="truncate">{label}</span>
              {href === "/account/orders/" && orderCount > 0 && (
                <span className="tnum text-xs text-brand-400 lg:ml-auto">{orderCount}</span>
              )}
            </span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={logout}
        disabled={leaving}
        className={`${ITEM_CLASS} text-brand-600 hover:bg-red-50 hover:text-red-700 lg:mt-2`}
      >
        {leaving ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <LogOutIcon className="h-5 w-5 shrink-0" />}
        <span className="truncate">Выход</span>
      </button>
    </nav>
  );
}
