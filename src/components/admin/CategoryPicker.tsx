"use client";

import { useState } from "react";

export interface CategoryChoice {
  id: string;
  name: string;
  parentId: string | null;
  children: number;
  count: number;
  thumb: string | null;
}

export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: CategoryChoice[];
  value: string;
  onChange: (id: string) => void;
}) {
  const roots = categories.filter((category) => !category.parentId);
  const selected = categories.find((category) => category.id === value);
  const [openedRoot, setOpenedRoot] = useState(selected?.parentId ?? selected?.id ?? "");

  const activeRoot = roots.find((root) => root.id === openedRoot);
  const children = activeRoot?.children
    ? categories.filter((category) => category.parentId === activeRoot.id)
    : [];

  const chooseRoot = (id: string) => {
    const root = roots.find((item) => item.id === id);
    if (!root) return;
    setOpenedRoot(root.id);
    if (!root.children) onChange(root.id);
    else if (selected?.parentId !== root.id) onChange("");
  };

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Раздел">
        <TileRow items={roots} value={activeRoot?.id ?? ""} onChange={chooseRoot} />
      </div>
      {activeRoot && children.length > 0 && (
        <div role="radiogroup" aria-label={`Подраздел: ${activeRoot.name}`}>
          <p className="mb-1.5 text-xs font-semibold text-brand-500">
            {activeRoot.name}
            {selected?.parentId !== activeRoot.id && (
              <span className="ml-1.5 font-normal text-amber-700">— выберите подраздел</span>
            )}
          </p>
          <TileRow items={children} value={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

function TileRow({
  items,
  value,
  onChange,
}: {
  items: CategoryChoice[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8 lg:grid-cols-12">
      {items.map((category) => {
        const selected = category.id === value;
        return (
          <button
            key={category.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(category.id)}
            className={`flex flex-col overflow-hidden rounded-lg border-2 bg-white text-left transition-colors ${
              selected
                ? "border-brand-700 ring-2 ring-brand-700/20"
                : "border-brand-100 hover:border-brand-300"
            }`}
          >
            <span className="block aspect-[4/3] w-full bg-brand-50">
              {category.thumb ? (
                <img
                  src={category.thumb}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-base font-semibold text-brand-200">
                  {category.name.charAt(0)}
                </span>
              )}
            </span>
            <span
              className={`block px-1 py-1 text-[11px] leading-tight break-words hyphens-auto ${
                selected ? "font-semibold text-brand-900" : "text-brand-700"
              }`}
            >
              {category.name}
              <span className="ml-0.5 text-brand-300">{category.count}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
