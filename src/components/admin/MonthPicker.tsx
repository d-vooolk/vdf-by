"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ChevronDownIcon, ChevronRightIcon } from "@/components/icons";

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

export function MonthPicker({
  year,
  month,
  query,
}: {
  year: number;
  month: number;
  query: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [shownYear, setShownYear] = useState(year);
  const root = useRef<HTMLDivElement>(null);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (value: number) => {
    setOpen(false);
    const params = new URLSearchParams({ ...query, month: monthKey(shownYear, value) });
    router.push(`/admin/accounting/?${params}`);
  };

  const toggle = () => {
    setShownYear(year);
    setOpen((value) => !value);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="field flex min-w-48 items-center justify-between gap-3 text-left"
      >
        <span>
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <ChevronDownIcon className="h-4 w-4 text-brand-400" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Выбор месяца"
          className="absolute left-0 top-full z-30 mt-1 w-64 rounded-card border border-brand-100 bg-white p-3 shadow-pop"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShownYear((value) => value - 1)}
              aria-label="Предыдущий год"
              className="btn-ghost px-2 py-1"
            >
              <ChevronRightIcon className="h-4 w-4 rotate-180" />
            </button>
            <span className="text-sm font-semibold text-brand-900">{shownYear}</span>
            <button
              type="button"
              onClick={() => setShownYear((value) => value + 1)}
              disabled={shownYear >= currentYear}
              aria-label="Следующий год"
              className="btn-ghost px-2 py-1 disabled:opacity-30"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((label, index) => {
              const value = index + 1;
              const selected = shownYear === year && value === month;
              const future = shownYear > currentYear || (shownYear === currentYear && value > currentMonth);
              return (
                <button
                  key={label}
                  type="button"
                  disabled={future}
                  onClick={() => choose(value)}
                  className={`rounded-lg px-2 py-2 text-sm ${
                    selected
                      ? "bg-brand-700 font-semibold text-white"
                      : "text-brand-800 hover:bg-brand-100 disabled:text-brand-300 disabled:hover:bg-transparent"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
