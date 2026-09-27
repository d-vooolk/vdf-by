"use client";

import { useSyncExternalStore } from "react";

import { CloseIcon } from "@/components/icons";
import type { Channel } from "@/lib/contacts";

/**
 * Панель связи, висящая справа на каждой странице.
 *
 * Сделана по образцу prime-auto.by: столбик круглых кнопок мессенджеров и
 * переключатель под ними. Отличие одно, и оно важное — список каналов не
 * захардкожен в файле конфигурации, а приходит из настроек магазина
 * (src/lib/contacts.ts). Не заполнен Viber — кнопки Viber не будет.
 *
 * Свёрнутое состояние запоминается в sessionStorage: человек, который
 * закрыл панель, не должен закрывать её заново на каждой странице.
 */

const STORAGE_KEY = "contacts-bar-open";

/*
 * Свёрнуто или развёрнуто — состояние внешнее по отношению к React: оно
 * лежит в sessionStorage и переживает переход на другую страницу.
 *
 * Отсюда useSyncExternalStore, а не useState с чтением в эффекте: страницы
 * собраны заранее, и на сервере sessionStorage не существует. У этого хука
 * для такого случая есть отдельный серверный снимок — на сборке панель
 * всегда развёрнута, а в браузере он сразу отдаёт сохранённое значение, без
 * лишнего рендера и без расхождения разметки при гидратации.
 */
const listeners = new Set<() => void>();

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

const isOpen = () => sessionStorage.getItem(STORAGE_KEY) !== "0";
const openOnServer = () => true;

function store(open: boolean): void {
  sessionStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  for (const notify of listeners) notify();
}

export function FloatingContacts({ channels }: { channels: Channel[] }) {
  const open = useSyncExternalStore(subscribe, isOpen, openOnServer);

  if (!channels.length) return null;

  return (
    <div
      className="fixed right-3 bottom-4 z-40 flex flex-col items-center gap-2 sm:right-5 sm:bottom-6 sm:gap-2.5"
      aria-label="Связаться с нами"
    >
      {channels.map((channel) => (
        <a
          key={channel.id}
          href={channel.href}
          target={channel.external ? "_blank" : undefined}
          rel={channel.external ? "noopener noreferrer nofollow" : undefined}
          title={channel.label}
          aria-label={channel.label}
          // Кнопки не размонтируются, а прячутся: так их видит краулер и
          // читает скринридер, когда панель развёрнута.
          hidden={!open}
          className="flex h-12 w-12 items-center justify-center rounded-full shadow-card-hover transition-transform duration-150 hover:scale-110 active:scale-95 sm:h-[3.25rem] sm:w-[3.25rem]"
        >
          <img
            src={channel.icon}
            alt=""
            width={52}
            height={52}
            loading="lazy"
            fetchPriority="low"
            className="h-full w-full"
          />
        </a>
      ))}

      <button
        type="button"
        onClick={() => store(!open)}
        aria-expanded={open}
        title={open ? "Свернуть" : "Связаться"}
        aria-label={open ? "Свернуть панель связи" : "Связаться с нами"}
        className={`flex h-12 w-12 items-center justify-center rounded-full shadow-card-hover transition-transform duration-150 hover:scale-110 active:scale-95 sm:h-[3.25rem] sm:w-[3.25rem] ${
          open ? "bg-brand-900 text-white" : ""
        }`}
      >
        {open ? (
          <CloseIcon className="h-5 w-5" />
        ) : (
          <img
            src="/chatIcons/phone.svg"
            alt=""
            width={52}
            height={52}
            loading="lazy"
            fetchPriority="low"
            className="h-full w-full"
          />
        )}
      </button>
    </div>
  );
}
