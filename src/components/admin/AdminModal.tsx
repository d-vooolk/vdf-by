"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

import { CloseIcon, SpinnerIcon } from "@/components/icons";
import { useBackdropClose } from "@/lib/use-backdrop-close";

export function AdminModal({
  title,
  onClose,
  children,
  width = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  const backdrop = useBackdropClose(onClose);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-brand-900/60 p-0 sm:items-center sm:p-4"
      {...backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`max-h-[100dvh] w-full ${width} overflow-y-auto rounded-t-card bg-white p-5 shadow-pop sm:rounded-card sm:p-6`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-brand-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="btn-ghost -mr-2 -mt-1 px-2 py-1">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ModalActions({
  pending,
  submitLabel,
  submitClassName = "btn-primary py-2 text-sm",
  disabled = false,
  onCancel,
}: {
  pending: boolean;
  submitLabel: string;
  submitClassName?: string;
  disabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="btn-ghost py-2 text-sm">
        Отмена
      </button>
      <button type="submit" disabled={pending || disabled} className={submitClassName}>
        {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
        {submitLabel}
      </button>
    </div>
  );
}

