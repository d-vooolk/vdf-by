import { DISCLAIMER_SHORT } from "@/lib/disclaimer";

export function DisclaimerHint({ className = "" }: { className?: string }) {
  return (
    <span className={`group relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label="О магазине: независимый магазин, не представитель VDF-Light"
        aria-describedby="disclaimer-hint"
        className="flex h-5 w-5 items-center justify-center rounded-full border border-brand-300 text-[11px] leading-none font-bold text-brand-500 transition-colors hover:border-accent-500 hover:text-brand-900 focus-visible:border-accent-500"
      >
        i
      </button>
      <span
        id="disclaimer-hint"
        role="tooltip"
        className="pointer-events-none invisible absolute top-full left-1/2 z-50 mt-2 w-72 -translate-x-1/2 rounded-control border border-brand-100 bg-white p-3 text-xs leading-relaxed font-normal text-brand-700 opacity-0 shadow-pop transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 sm:left-0 sm:translate-x-0"
      >
        {DISCLAIMER_SHORT}
      </span>
    </span>
  );
}
