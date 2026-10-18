"use client";

import { useEffect, useRef, useState } from "react";

import type { Channel } from "@/lib/contacts";

import styles from "./FloatingContacts.module.css";

const AUTO_OPEN_MS = 800;
const AUTO_CLOSE_MS = 5000;
const STEP_MS = 45;
const DURATION_MS = 280;

function itemDelay(index: number, count: number, open: boolean): string {
  const delay = (open ? count - 1 - index : index) * STEP_MS;
  return open ? `${delay}ms, ${delay}ms, ${delay}ms` : `${delay}ms, ${delay}ms, ${delay + DURATION_MS}ms`;
}

export function FloatingContacts({ channels }: { channels: Channel[] }) {
  const [open, setOpen] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timers.current = [
      setTimeout(() => setOpen(true), AUTO_OPEN_MS),
      setTimeout(() => setOpen(false), AUTO_OPEN_MS + AUTO_CLOSE_MS),
    ];
    return () => timers.current.forEach(clearTimeout);
  }, []);

  if (!channels.length) return null;

  const toggle = () => {
    timers.current.forEach(clearTimeout);
    setOpen((value) => !value);
  };

  return (
    <div className={`${styles.wrapper} ${open ? styles.open : ""}`} aria-label="Связаться с нами">
      <div className={styles.items}>
        {channels.map((channel, index) => (
          <a
            key={channel.id}
            href={channel.href}
            target={channel.external ? "_blank" : undefined}
            rel={channel.external ? "noopener noreferrer nofollow" : undefined}
            title={channel.label}
            aria-label={channel.label}
            aria-hidden={!open}
            tabIndex={open ? 0 : -1}
            className={styles.item}
            style={
              {
                transitionDelay: itemDelay(index, channels.length, open),
                "--shift": `${(channels.length - index) * 30}px`,
              } as React.CSSProperties
            }
          >
            <img src={channel.icon} alt="" width={52} height={52} loading="lazy" fetchPriority="low" />
          </a>
        ))}
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title={open ? "Свернуть" : "Связаться"}
        aria-label={open ? "Свернуть кнопки связи" : "Показать кнопки связи"}
        className={styles.toggle}
      >
        {open ? (
          <svg viewBox="64 64 896 896" aria-hidden="true" className={styles.close}>
            <path d="M512 64c247.4 0 448 200.6 448 448S759.4 960 512 960 64 759.4 64 512 264.6 64 512 64zm127.98 274.82h-.04l-.08.06L512 466.75 384.14 338.88c-.04-.05-.06-.06-.08-.06a.12.12 0 00-.07 0c-.03 0-.05.01-.09.05l-45.02 45.02a.2.2 0 00-.05.09.12.12 0 000 .07v.02a.27.27 0 00.06.06L466.75 512 338.88 639.86c-.05.04-.06.06-.06.08a.12.12 0 000 .07c0 .03.01.05.05.09l45.02 45.02a.2.2 0 00.09.05.12.12 0 00.07 0c.02 0 .04-.01.08-.05L512 557.25l127.86 127.87c.04.04.06.05.08.05a.12.12 0 00.07 0c.03 0 .05-.01.09-.05l45.02-45.02a.2.2 0 00.05-.09.12.12 0 000-.07v-.02a.27.27 0 00-.05-.06L557.25 512l127.87-127.86c.04-.04.05-.06.05-.08a.12.12 0 000-.07c0-.03-.01-.05-.05-.09l-45.02-45.02a.2.2 0 00-.09-.05.12.12 0 00-.07 0z" />
          </svg>
        ) : (
          <img src="/chatIcons/phone.svg" alt="" width={52} height={52} className={styles.pulse} />
        )}
      </button>
    </div>
  );
}
