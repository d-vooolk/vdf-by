import type { ReactNode } from "react";

interface WorkshopNoteProps {
  link: { href: string; anchor: string };
  className?: string;
  children?: ReactNode;
}

export function WorkshopNote({ link, className = "", children }: WorkshopNoteProps) {
  return (
    <div className={`rounded-card border border-brand-100 p-4 ${className}`}>
      <p className="text-sm font-semibold text-brand-900">Нужна установка?</p>
      <p className="mt-1 text-sm text-brand-600">
        Поставим в мастерской Prime Auto в Минске: разборка фары, установка, герметизация и регулировка
        света по ГОСТ.{" "}
        <a
          href={link.href}
          target="_blank"
          rel="noopener"
          className="font-medium text-brand-900 underline hover:text-brand-600"
        >
          {link.anchor}
        </a>
      </p>
      {children}
    </div>
  );
}
