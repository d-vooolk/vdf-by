"use client";

import { useState } from "react";

import { PrinterIcon, SpinnerIcon } from "@/components/icons";

type LabelTarget = { productId: string } | { categoryId: string; type: string };

type LabelLayout = "label" | "number" | "storage";

const CAPTIONS: Record<LabelLayout, string> = {
  label: "Печать этикетки",
  number: "Печать номера рамки",
  storage: "Печать складского номера",
};

interface PrintLabelButtonProps {
  target: LabelTarget;
  layout?: LabelLayout;
  withText?: boolean;
  className?: string;
}

function labelUrl(target: LabelTarget, layout: LabelLayout): string {
  const params =
    "productId" in target
      ? new URLSearchParams({ product: target.productId })
      : new URLSearchParams({ category: target.categoryId, type: target.type });
  if (layout !== "label") params.set("layout", layout);
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

export function PrintLabelButton({
  target,
  layout = "label",
  withText = false,
  className = "",
}: PrintLabelButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const caption = CAPTIONS[layout];

  const print = async () => {
    setPending(true);
    setError("");
    try {
      const response = await fetch(labelUrl(target, layout), { cache: "no-store" });
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
      title={error || `${caption} 58×40`}
      aria-label={caption}
      className={`btn-ghost shrink-0 ${error ? "text-red-700" : ""} ${className}`}
    >
      {pending ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <PrinterIcon className="h-4 w-4" />}
      {layout === "number" && <span className="text-xs font-semibold leading-none">№</span>}
      {layout === "storage" && <span className="text-xs font-semibold leading-none">СК</span>}
      {withText && (error ? "Ошибка печати" : caption)}
    </button>
  );
}
