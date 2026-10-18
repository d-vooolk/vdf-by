"use client";

import { useState } from "react";

import { ImageComposer } from "./ImageComposer";
import { PhotoEditor } from "./PhotoEditor";

const TABS = [
  { id: "car", label: "Картинка с автомобилем" },
  { id: "photo", label: "Обработка фото" },
] as const;

export function ComposerTabs() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("car");
  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-2" aria-label="Режим генератора">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-pressed={tab === item.id}
            className={`rounded-xl px-4 py-1.5 text-sm font-medium ${
              tab === item.id ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === "car" ? <ImageComposer /> : <PhotoEditor />}
    </div>
  );
}
