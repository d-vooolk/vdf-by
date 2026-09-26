"use client";

import { useRef, useState, type PointerEvent } from "react";

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RegionSelectorProps {
  src: string;
  value: Region | null;
  onChange: (region: Region | null) => void;
  className?: string;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function RegionSelector({ src, value, onChange, className = "" }: RegionSelectorProps) {
  const box = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);

  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  };

  const begin = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = point(event);
    setStart(origin);
    onChange({ ...origin, width: 0, height: 0 });
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!start) return;
    const current = point(event);
    onChange({
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y),
    });
  };

  const end = () => {
    setStart(null);
    if (value && (value.width < 0.005 || value.height < 0.005)) onChange(null);
  };

  return (
    <div
      ref={box}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className={`relative cursor-crosshair touch-none overflow-hidden rounded-lg select-none ${className}`}
    >
      <img src={src} alt="" draggable={false} className="block h-auto w-full" />
      {value && (
        <span
          className="pointer-events-none absolute border-2 border-accent-400 bg-accent-300/30"
          style={{
            left: `${value.x * 100}%`,
            top: `${value.y * 100}%`,
            width: `${value.width * 100}%`,
            height: `${value.height * 100}%`,
          }}
        />
      )}
    </div>
  );
}
