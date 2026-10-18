"use client";

import { useEffect, useRef, useState } from "react";

import { DISCLAIMER_SHORT } from "@/lib/disclaimer";

const PLACEMENTS = {
  below: "top-full mt-2",
  above: "bottom-full mb-2",
} as const;

const RINGS = {
  light: "shadow-[0_0_0_2px_#f3f6f6,0_2px_6px_rgb(122_106_86/0.45)]",
  dark: "shadow-[0_0_0_2px_#1e362d,0_2px_6px_rgb(0_0_0/0.35)]",
} as const;

export function DisclaimerHint({
  id,
  className = "",
  placement = "below",
  ring = "light",
}: {
  id: string;
  className?: string;
  placement?: keyof typeof PLACEMENTS;
  ring?: keyof typeof RINGS;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <span ref={root} className={`group inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="О магазине: независимый магазин, не представитель VDF-Light"
        aria-describedby={id}
        aria-expanded={open}
        className={`flex h-5 w-5 items-center justify-center rounded-full bg-[#c8b48e] font-serif text-[12px] leading-none font-bold text-[#1a2b20] ${RINGS[ring]} transition-colors hover:bg-[#b8a586] focus-visible:bg-[#b8a586]`}
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute ${PLACEMENTS[placement]} left-1/2 z-50 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-control border border-brand-100 bg-white p-3 text-xs leading-relaxed font-normal text-brand-700 shadow-pop transition-opacity duration-150 sm:left-0 sm:translate-x-0 ${
          open
            ? "visible opacity-100"
            : "pointer-events-none invisible opacity-0 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
        }`}
      >
        {DISCLAIMER_SHORT}
      </span>
    </span>
  );
}
