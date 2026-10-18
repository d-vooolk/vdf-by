"use client";

import { useState } from "react";

import { ChevronDownIcon } from "@/components/icons";

export function ExpandableMarks({ hidden, children }: { hidden: number; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="group" data-collapsed={hidden > 0 && !expanded}>
      {children}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="btn-ghost mt-3 px-3 py-1.5 text-sm"
        >
          {expanded ? "Свернуть" : `Показать все марки (ещё ${hidden})`}
          <ChevronDownIcon className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}
