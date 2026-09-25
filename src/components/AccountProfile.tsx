"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AlertIcon, CheckIcon } from "@/components/icons";
import { useAccount } from "@/store/account";

export function AccountProfile({
  name: initialName,
  address: initialAddress,
  kind,
  wholesaleStatus,
}: {
  name: string;
  address: string;
  kind: "retail" | "wholesale";
  wholesaleStatus: "none" | "pending" | "approved" | "rejected";
}) {
  const router = useRouter();
  const loadAccount = useAccount((state) => state.load);
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState(initialAddress);
  const [requestWholesale, setRequestWholesale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const canRequest = wholesaleStatus === "none";
  const needsAddress = kind === "wholesale" || requestWholesale;

  const save = async () => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/account/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "profile", name, address, requestWholesale }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Не удалось сохранить");
        return;
      }
      setSaved(true);
      setRequestWholesale(false);
      await loadAccount(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/account/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    useAccount.getState().reset();
    router.push("/");
    router.refresh();
  };

  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="block">
        <span className="label">{kind === "wholesale" ? "Компания или ФИО" : "ФИО"}</span>
        <input value={name} onChange={(event) => setName(event.target.value)} className="field" />
      </label>

      {needsAddress && (
        <label className="block">
          <span className="label">Адрес магазина или мастерской</span>
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="field"
          />
        </label>
      )}

      {canRequest && (
        <label className="flex items-center gap-2 text-sm text-brand-700">
          <input
            type="checkbox"
            checked={requestWholesale}
            onChange={(event) => setRequestWholesale(event.target.checked)}
            className="h-4 w-4 rounded border-brand-300 text-brand-700"
          />
          Я оптовый покупатель — хочу получить оптовые цены
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="btn-primary py-2 text-sm">
          Сохранить
        </button>
        <button type="button" onClick={logout} className="btn-ghost py-2 text-sm">
          Выйти
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-700">
            <CheckIcon className="h-4 w-4" />
            Сохранено
          </span>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-red-700" role="alert">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </form>
  );
}
