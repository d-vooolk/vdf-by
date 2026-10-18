"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { formatPrice } from "@/lib/format";

import styles from "./OrderCelebration.module.css";

const RAYS = 16;
const COUNT_UP_DELAY_MS = 450;
const COUNT_UP_MS = 900;
const EXIT_MS = 2300;
const DONE_MS = 2750;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useCountUp(amount: number): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? amount : 0));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let frame = 0;
    const start = performance.now() + COUNT_UP_DELAY_MS;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / COUNT_UP_MS));
      setValue(amount * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [amount]);
  return value;
}

export function OrderCelebration({
  orderId,
  total,
  currencySymbol,
  title = "Заказ принят",
  onDone,
}: {
  orderId: number | null;
  total: number;
  currencySymbol: string;
  title?: string;
  onDone: () => void;
}) {
  const [exiting, setExiting] = useState(false);
  const shown = useCountUp(total);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const exitTimer = setTimeout(() => setExiting(true), EXIT_MS);
    const doneTimer = setTimeout(() => doneRef.current(), DONE_MS);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  return createPortal(
    <div className={`${styles.overlay} ${exiting ? styles.exit : styles.enter}`} role="status" aria-live="polite">
      <div className={styles.beam} />
      <div className={styles.stage}>
        <div className={styles.emblem}>
          <span className={styles.wave} />
          <span className={`${styles.wave} ${styles.waveLate}`} />
          {Array.from({ length: RAYS }, (_, index) => (
            <span
              key={index}
              className={styles.ray}
              style={
                {
                  "--ray-angle": `${(360 / RAYS) * index}deg`,
                  "--ray-delay": `${0.42 + (index % 4) * 0.03}s`,
                } as React.CSSProperties
              }
            />
          ))}
          <svg className={styles.mark} viewBox="0 0 120 120" aria-hidden="true">
            <circle className={styles.track} cx="60" cy="60" r="52" />
            <circle className={styles.ring} cx="60" cy="60" r="52" pathLength={1} />
            <path className={styles.check} d="M38 61.5l15 15 30-32" pathLength={1} />
          </svg>
        </div>
        <p className={styles.label}>{title}</p>
        {total > 0 && <p className={styles.amount}>{formatPrice(Math.round(shown), currencySymbol)}</p>}
        <p className={styles.caption}>
          {orderId ? `Заказ № ${orderId} · ` : ""}менеджер скоро перезвонит
        </p>
      </div>
    </div>,
    document.body,
  );
}
