"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ConsentCheckbox } from "@/components/ConsentCheckbox";
import { CheckIcon, CloseIcon, SpinnerIcon } from "@/components/icons";
import { WorkshopNote } from "@/components/WorkshopNote";
import { SERVICE_PHONE, SERVICE_PHONE_HREF } from "@/lib/service-contacts";
import { useAccount } from "@/store/account";

interface ServiceOfferProps {
  productId?: string;
  productTitle?: string;
  variant?: "card" | "page";
  workshop?: { href: string; anchor: string } | null;
}

export function ServiceOffer({ productId, productTitle, variant = "card", workshop }: ServiceOfferProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "card" && workshop ? (
        <WorkshopNote link={workshop} className="mb-6">
          <p className="mt-1 text-sm text-brand-600">
            Мастерская:{" "}
            <a href={`tel:${SERVICE_PHONE_HREF}`} className="tnum font-medium text-brand-900 underline">
              {SERVICE_PHONE}
            </a>
          </p>
          <button type="button" onClick={() => setOpen(true)} className="btn-secondary mt-3 py-2 text-sm">
            Рассчитать установку
          </button>
        </WorkshopNote>
      ) : variant === "card" ? (
        <div className="mb-6 rounded-card border border-brand-100 p-4">
          <p className="text-sm font-semibold text-brand-900">Установим в нашем сервисе</p>
          <p className="mt-1 text-sm text-brand-600">
            Поставим деталь, отрегулируем свет и проверим герметичность фары. Мастерская:{" "}
            <a href={`tel:${SERVICE_PHONE_HREF}`} className="tnum font-medium text-brand-900 underline">
              {SERVICE_PHONE}
            </a>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" onClick={() => setOpen(true)} className="btn-secondary py-2 text-sm">
              Рассчитать установку
            </button>
            <Link href="/ustanovka/" className="text-sm text-brand-600 underline hover:text-brand-900">
              Подробнее об установке
            </Link>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="btn-primary">
          Рассчитать стоимость установки
        </button>
      )}

      {open && <ServiceRequestDialog productId={productId} productTitle={productTitle} onClose={() => setOpen(false)} />}
    </>
  );
}

function ServiceRequestDialog({
  productId,
  productTitle,
  onClose,
}: {
  productId?: string;
  productTitle?: string;
  onClose: () => void;
}) {
  const customer = useAccount((state) => state.customer);
  const loadAccount = useAccount((state) => state.load);
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [car, setCar] = useState("");
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string; consent?: string }>({});
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "failed">("idle");
  const [failure, setFailure] = useState("");

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const [prefilledFor, setPrefilledFor] = useState(customer);
  if (customer && prefilledFor !== customer) {
    setPrefilledFor(customer);
    setName((current) => current || customer.name);
    setPhone((current) => current || customer.phone);
  }

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "Как к вам обращаться?";
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 13) next.phone = "Введите номер — мастер перезвонит";
    if (!consent) next.consent = "Без согласия мы не сможем принять заявку";
    setErrors(next);
    if (Object.keys(next).length) return;

    setStatus("sending");
    setFailure("");
    try {
      const response = await fetch("/api/service-request/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, car, comment, consent, website, productId }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? `сервер ответил ${response.status}`);
      setStatus("done");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "не удалось отправить");
      setStatus("failed");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-brand-900/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Расчёт установки"
    >
      <div
        className="w-full max-w-md rounded-t-card bg-white p-5 shadow-pop sm:rounded-card sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-brand-900">
              {status === "done" ? "Заявка принята" : "Расчёт установки"}
            </h2>
            <p className="mt-1 text-sm text-brand-500">
              {status === "done"
                ? "Мастер перезвонит, назовёт цену и время."
                : "Мастер перезвонит и назовёт цену и срок работы."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mt-1 -mr-1 rounded-xl p-2 text-brand-400 hover:bg-brand-50"
            aria-label="Закрыть"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {status === "done" ? (
          <div className="flex items-center gap-3 rounded-card bg-green-50 p-4">
            <CheckIcon className="h-6 w-6 shrink-0 text-green-600" />
            <p className="text-sm text-green-900">
              Если удобнее, позвоните сами:{" "}
              <a href={`tel:${SERVICE_PHONE_HREF}`} className="tnum font-semibold underline">
                {SERVICE_PHONE}
              </a>
            </p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            {productTitle && (
              <p className="rounded-card bg-brand-50 p-3 text-sm text-brand-600">{productTitle}</p>
            )}
            <div>
              <label htmlFor="service-name" className="label">
                Имя <span className="text-red-600">*</span>
              </label>
              <input
                id="service-name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={`field ${errors.name ? "field-error" : ""}`}
              />
              {errors.name && <p className="mt-1.5 text-xs text-red-600">{errors.name}</p>}
            </div>
            <div>
              <label htmlFor="service-phone" className="label">
                Телефон <span className="text-red-600">*</span>
              </label>
              <input
                id="service-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={`field tnum ${errors.phone ? "field-error" : ""}`}
                placeholder="+375 29 123-45-67"
              />
              {errors.phone && <p className="mt-1.5 text-xs text-red-600">{errors.phone}</p>}
            </div>
            <div>
              <label htmlFor="service-car" className="label">
                Автомобиль
              </label>
              <input
                id="service-car"
                value={car}
                onChange={(event) => setCar(event.target.value)}
                className="field"
                placeholder="BMW 5 F10, 2012"
              />
            </div>
            <div>
              <label htmlFor="service-comment" className="label">
                Что нужно сделать
              </label>
              <textarea
                id="service-comment"
                rows={2}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="field"
                placeholder="Замена стёкол на обеих фарах"
              />
            </div>
            <ConsentCheckbox id="service-consent" checked={consent} onChange={setConsent} error={errors.consent} />
            <div className="hidden" aria-hidden="true">
              <label htmlFor="service-website">Сайт</label>
              <input
                id="service-website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>
            {status === "failed" && (
              <p className="rounded-card border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                Не отправилось: {failure}. Позвоните мастеру:{" "}
                <a href={`tel:${SERVICE_PHONE_HREF}`} className="font-semibold underline">
                  {SERVICE_PHONE}
                </a>
              </p>
            )}
            <button type="submit" disabled={status === "sending"} className="btn-primary w-full">
              {status === "sending" ? (
                <>
                  <SpinnerIcon className="h-5 w-5 animate-spin" />
                  Отправляем…
                </>
              ) : (
                "Отправить заявку"
              )}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
