"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteCustomerAction,
  editCustomerAction,
  setCustomerNoteAction,
  setCustomerSellerAction,
  setCustomerStaffAction,
  setWholesaleStatusAction,
  setWholesaleTierAction,
} from "@/app/admin/customer-actions";
import { formatPhone } from "@/lib/phone";
import { WHOLESALE_TIERS, type WholesaleTier } from "@/lib/wholesale-tiers";

export function CustomerControls({
  id,
  status,
  tier: initialTier,
  note: initialNote,
  staff,
  seller,
  profile,
}: {
  id: number;
  status: "none" | "pending" | "approved" | "rejected";
  tier: WholesaleTier;
  note: string;
  staff: boolean;
  seller: boolean;
  profile: CustomerProfile;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(initialNote);
  const [tier, setTier] = useState(initialTier);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState("");
  const [editing, setEditing] = useState(false);

  const run = (task: () => Promise<{ ok: boolean; problems: string[] } | void>) =>
    startTransition(async () => {
      const result = await task();
      setProblem(result && !result.ok ? result.problems.join("; ") : "");
      router.refresh();
    });

  return (
    <div className="space-y-2">
      {editing && (
        <ProfileForm
          id={id}
          profile={profile}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Изменить данные
          </button>
        )}
        {!staff && (
          <select
            value={tier}
            disabled={pending}
            onChange={(event) => {
              const next = event.target.value as WholesaleTier;
              setTier(next);
              if (status === "approved") run(() => setWholesaleTierAction(id, next));
            }}
            aria-label="Тип опта"
            className="field w-auto py-1.5 text-xs"
          >
            {(Object.keys(WHOLESALE_TIERS) as WholesaleTier[]).map((option) => (
              <option key={option} value={option}>
                {WHOLESALE_TIERS[option].label}
              </option>
            ))}
          </select>
        )}
        {!staff && status !== "approved" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setWholesaleStatusAction(id, "approved", tier))}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            {tier === "base" ? "Подтвердить опт" : `Подтвердить ${WHOLESALE_TIERS[tier].label}`}
          </button>
        )}
        {!staff && status === "pending" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setWholesaleStatusAction(id, "rejected"))}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Отклонить
          </button>
        )}
        {!staff && status === "approved" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setWholesaleStatusAction(id, "none"))}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Снять опт
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setCustomerStaffAction(id, !staff))}
          className={`${staff ? "btn-secondary" : "btn-ghost"} px-3 py-1.5 text-xs`}
        >
          {staff
            ? "Снять роль сотрудника"
            : status === "approved" || status === "pending"
              ? "Сделать сотрудником (опт снимется)"
              : "Сделать сотрудником"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setCustomerSellerAction(id, !seller))}
          title="Продавец — сотрудник с переключателем «Сотрудник / Покупатель / Оптовик» в шапке сайта"
          className={`${seller ? "btn-secondary" : "btn-ghost"} px-3 py-1.5 text-xs`}
        >
          {seller ? "Снять роль продавца" : staff ? "Сделать продавцом" : "Сделать продавцом (станет сотрудником)"}
        </button>
        {confirmDelete ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteCustomerAction(id))}
              className="btn-secondary px-3 py-1.5 text-xs text-red-700"
            >
              Да, удалить кабинет
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              Отмена
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="btn-ghost px-3 py-1.5 text-xs text-brand-400"
          >
            Удалить
          </button>
        )}
      </div>
      {problem && (
        <p role="alert" className="text-xs text-red-700">
          {problem}
        </p>
      )}
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onBlur={() => {
          if (note !== initialNote) run(() => setCustomerNoteAction(id, note));
        }}
        rows={2}
        placeholder="Заметка: о чём договорились по телефону"
        className="field w-full py-1.5 text-xs"
      />
    </div>
  );
}

interface CustomerProfile {
  name: string;
  phone: string;
  address: string;
}

function ProfileForm({
  id,
  profile,
  onDone,
}: {
  id: number;
  profile: CustomerProfile;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({ ...profile, phone: formatPhone(profile.phone) });
  const [problem, setProblem] = useState("");
  const patch = (changes: Partial<CustomerProfile>) => setValues((current) => ({ ...current, ...changes }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await editCustomerAction(id, values);
          if (result.ok) onDone();
          else setProblem(result.problems.join("; "));
        });
      }}
      className="space-y-2 rounded-xl border border-brand-100 bg-brand-50 p-3"
    >
      <label className="block">
        <span className="label mb-1 text-xs">Наименование</span>
        <input
          value={values.name}
          onChange={(event) => patch({ name: event.target.value })}
          className="field py-1.5 text-sm"
        />
      </label>
      <label className="block">
        <span className="label mb-1 text-xs">Телефон</span>
        <input
          value={values.phone}
          onChange={(event) => patch({ phone: event.target.value })}
          inputMode="tel"
          className="field tnum py-1.5 text-sm"
        />
        <span className="mt-1 block text-[11px] text-brand-400">По этому номеру покупатель входит в кабинет</span>
      </label>
      <label className="block">
        <span className="label mb-1 text-xs">Адрес</span>
        <textarea
          value={values.address}
          onChange={(event) => patch({ address: event.target.value })}
          rows={2}
          className="field py-1.5 text-sm"
        />
      </label>
      {problem && (
        <p role="alert" className="text-xs text-red-700">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary px-3 py-1.5 text-xs">
          Сохранить
        </button>
        <button type="button" disabled={pending} onClick={onDone} className="btn-ghost px-3 py-1.5 text-xs">
          Отмена
        </button>
      </div>
    </form>
  );
}
