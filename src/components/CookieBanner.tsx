"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PRIVACY_URL } from "@/components/ConsentCheckbox";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  NO_ANALYTICS_COOKIE,
  parseConsent,
  type ConsentChoice,
} from "@/lib/analytics";
import { useAccount } from "@/store/account";
import { useHydrated } from "@/store/cart";

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  return document.cookie.split("; ").find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function readStored(): ConsentChoice | null {
  try {
    return parseConsent(localStorage.getItem(CONSENT_COOKIE));
  } catch {
    return null;
  }
}

function remember(choice: ConsentChoice): void {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${choice}; path=/; max-age=${CONSENT_MAX_AGE}; samesite=lax${secure}`;
  try {
    localStorage.setItem(CONSENT_COOKIE, choice);
  } catch {}
}

function savedChoice(): ConsentChoice | null {
  return parseConsent(readCookie(CONSENT_COOKIE)) ?? readStored();
}

export function CookieBanner() {
  const hydrated = useHydrated();
  const [decided, setDecided] = useState(false);
  const accountStatus = useAccount((state) => state.status);
  const accountConsent = useAccount((state) => state.customer?.cookieConsent ?? null);
  const loadAccount = useAccount((state) => state.load);

  const local = hydrated ? savedChoice() : null;
  const excluded = hydrated && readCookie(NO_ANALYTICS_COOKIE) === "1";
  const signed = hydrated && readCookie("vdf_signed") === "1";
  const accountKnown = accountStatus === "customer" || accountStatus === "guest";

  useEffect(() => {
    if (local) remember(local);
    else if (signed && !excluded) void loadAccount();
  }, [local, signed, excluded, loadAccount]);

  useEffect(() => {
    if (!accountConsent || local) return;
    remember(accountConsent);
  }, [accountConsent, local]);

  const visible =
    hydrated && !decided && !excluded && !local && !accountConsent && (!signed || accountKnown);

  const choose = (choice: ConsentChoice) => {
    remember(choice);
    setDecided(true);
    if (!signed) return;
    void fetch("/api/account/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cookies", consent: choice }),
    }).catch(() => undefined);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Согласие на cookie"
      className="fixed bottom-3 left-3 right-20 z-40 rounded-xl border border-brand-100 bg-white/95 p-3 text-xs leading-snug text-brand-600 shadow-lg backdrop-blur sm:right-auto sm:max-w-sm"
    >
      <p>
        Используем cookie для работы сайта и статистики посещений.{" "}
        <Link href={PRIVACY_URL} className="text-brand-700 underline hover:text-brand-900">
          Подробнее
        </Link>
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => choose("yes")}
          className="rounded-lg bg-brand-700 px-3 py-1.5 font-medium text-white hover:bg-brand-800"
        >
          Принять
        </button>
        <button
          type="button"
          onClick={() => choose("no")}
          className="rounded-lg px-3 py-1.5 font-medium text-brand-600 hover:bg-brand-50"
        >
          Отклонить
        </button>
      </div>
    </div>
  );
}
