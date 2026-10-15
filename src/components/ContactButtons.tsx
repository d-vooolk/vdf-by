import type { Channel } from "@/lib/contacts";

/**
 * Ряд кнопок мессенджеров. Серверный компонент: это обычные ссылки, в
 * браузер ничего выполнять не уезжает.
 *
 * Иконки — готовые цветные бейджи из public/chatIcons, а не инлайновые
 * глифы: логотипы мессенджеров узнаются по цвету, и перекрашивать их в
 * фирменный синий магазина нельзя.
 */

interface ContactButtonsProps {
  channels: Channel[];
  /** Размер иконки в пикселях. */
  size?: number;
  className?: string;
  onSelect?: (channel: Channel) => void;
}

export function ContactButtons({
  channels,
  size = 28,
  className = "",
  onSelect,
}: ContactButtonsProps) {
  if (!channels.length) return null;

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {channels.map((channel) => (
        <a
          key={channel.id}
          href={channel.href}
          target={channel.external ? "_blank" : undefined}
          rel={channel.external ? "noopener noreferrer nofollow" : undefined}
          title={channel.label}
          aria-label={channel.label}
          onClick={onSelect ? () => onSelect(channel) : undefined}
          className="inline-flex shrink-0 rounded-full transition-transform duration-150 hover:scale-110 active:scale-95"
        >
          {/* Обычный img, а не next/image: оптимизатор картинок в проекте
              выключен, а svg он всё равно отдаёт как есть. */}
          <img
            src={channel.icon}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            style={{ width: size, height: size }}
          />
        </a>
      ))}
    </div>
  );
}
