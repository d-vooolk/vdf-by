"use client";

import { useState } from "react";

import { PrinterIcon, SpinnerIcon } from "@/components/icons";

type LabelTarget = { productId: string } | { categoryId: string; type: string };

interface PrintLabelButtonProps {
  target: LabelTarget;
  withText?: boolean;
  className?: string;
}

function labelUrl(target: LabelTarget): string {
  const params =
    "productId" in target
      ? new URLSearchParams({ product: target.productId })
      : new URLSearchParams({ category: target.categoryId, type: target.type });
  return `/admin/api/label/?${params}`;
}

function printInFrame(html: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    frame.onload = () => {
      const view = frame.contentWindow;
      if (!view) {
        frame.remove();
        resolve();
        return;
      }
      const cleanup = () => setTimeout(() => frame.remove(), 500);
      view.addEventListener("afterprint", cleanup, { once: true });
      view.focus();
      view.print();
      resolve();
    };
    frame.srcdoc = html;
    document.body.append(frame);
  });
}

export function PrintLabelButton({ target, withText = false, className = "" }: PrintLabelButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const print = async () => {
    setPending(true);
    setError("");
    try {
      const response = await fetch(labelUrl(target), { cache: "no-store" });
      if (!response.ok) {
        setError((await response.text()) || "Не удалось подготовить этикетку");
        return;
      }
      await printInFrame(await response.text());
    } catch {
      setError("Не удалось подготовить этикетку");
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={print}
      disabled={pending}
      title={error || "Печать этикетки 58×40"}
      aria-label="Печать этикетки"
      className={`btn-ghost shrink-0 ${error ? "text-red-700" : ""} ${className}`}
    >
      {pending ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <PrinterIcon className="h-4 w-4" />}
      {withText && (error ? "Ошибка печати" : "Печать этикетки")}
    </button>
  );
}
