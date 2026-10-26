import type { Site } from "./schema";

/**
 * Каналы связи — одним списком.
 *
 * Раньше телефон стоял в шапке, Telegram в подвале, а Viber не показывался
 * нигде: каждое место собирало ссылку само и по-своему. Теперь адреса
 * собираются здесь, и любой блок связи (плавающая панель справа, кнопки на
 * карточке товара, подвал) берёт готовый список.
 *
 * Незаполненное в настройках поле канала не даёт: в панели просто не будет
 * этой кнопки. Владельцу магазина не нужно знать, какой формат ссылки у
 * Viber, — достаточно вписать номер телефона.
 */

export type ChannelId =
  | "phone"
  | "telegram"
  | "whatsapp"
  | "instagram";

export interface Channel {
  id: ChannelId;
  /** Подпись для aria-label и подсказки. */
  label: string;
  href: string;
  /** Ссылка на иконку в public/chatIcons. */
  icon: string;
  /** Открывать в новой вкладке. У tel: и viber: этого делать не нужно. */
  external: boolean;
}

/* ------------------------------------------------------------------ */
/* Нормализация того, что вписали в админке                            */
/* ------------------------------------------------------------------ */

/** Только цифры. Плюс, скобки и дефисы из номера выбрасываются. */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

const isUrl = (value: string) => /^https?:\/\//i.test(value);

/**
 * Telegram: принимаем и полную ссылку, и «@autosvetby», и просто имя.
 * Номер телефона тоже годится — t.me/+375… открывает чат.
 */
function telegramUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (isUrl(raw)) return raw;
  if (raw.startsWith("tg://")) return raw;
  const name = raw.replace(/^@/, "");
  // Если вписали номер — в t.me он идёт с плюсом.
  if (/^\+?\d[\d\s()-]+$/.test(name)) return `https://t.me/+${digits(name)}`;
  return `https://t.me/${name}`;
}

/** WhatsApp: wa.me хочет номер без плюса и без разделителей. */
function whatsappUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (isUrl(raw)) return raw;
  const number = digits(raw);
  return number ? `https://wa.me/${number}` : "";
}

function instagramUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (isUrl(raw)) return raw;
  return `https://instagram.com/${raw.replace(/^@/, "")}`;
}

/* ------------------------------------------------------------------ */
/* Текст первого сообщения                                             */
/* ------------------------------------------------------------------ */

/**
 * Подставляет заготовленное сообщение в ссылку на чат.
 *
 * Telegram и WhatsApp понимают параметр text официально. Viber — нет, и
 * лишний параметр он просто игнорирует: чат всё равно откроется, только
 * пустой. Это лучше, чем не давать кнопку вовсе.
 */
function withMessage(href: string, message: string): string {
  if (!href || !message) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}text=${encodeURIComponent(message)}`;
}

/* ------------------------------------------------------------------ */

const ICONS: Record<ChannelId, string> = {
  phone: "/chatIcons/phone.svg",
  telegram: "/chatIcons/telegram.svg",
  whatsapp: "/chatIcons/whatsapp.svg",
  instagram: "/chatIcons/instagram.svg",
};

const LABELS: Record<ChannelId, string> = {
  phone: "Позвонить",
  telegram: "Написать в Telegram",
  whatsapp: "Написать в WhatsApp",
  instagram: "Instagram",
};

/**
 * Все заполненные каналы связи в порядке показа.
 *
 * `message` — текст, который подставится в чат мессенджера. На телефон и
 * Instagram он, разумеется, не влияет.
 */
export function getChannels(site: Site, message = ""): Channel[] {
  const raw: Array<{ id: ChannelId; href: string; external: boolean }> = [
    {
      id: "phone",
      href: site.phoneHref ? `tel:${site.phoneHref}` : "",
      external: false,
    },
    {
      id: "telegram",
      href: withMessage(telegramUrl(site.telegram), message),
      external: true,
    },
    {
      id: "whatsapp",
      href: withMessage(whatsappUrl(site.whatsapp), message),
      external: true,
    },
    { id: "instagram", href: instagramUrl(site.instagram), external: true },
  ];

  return raw
    .filter((entry) => entry.href)
    .map((entry) => ({
      ...entry,
      label: LABELS[entry.id],
      icon: ICONS[entry.id],
    }));
}

/** Только мессенджеры: их кнопки стоят на карточке товара. */
export function getMessengers(site: Site, message = ""): Channel[] {
  return getChannels(site, message).filter(
    (channel) => channel.id === "telegram" || channel.id === "whatsapp",
  );
}

/**
 * Заготовка сообщения по товару: что именно интересует и где это лежит.
 * Ссылка обязательна — без неё менеджеру придётся искать товар по названию.
 */
export function productMessage(
  site: Site,
  product: { title: string; slug: string },
  price?: string,
): string {
  const url = `${site.url.replace(/\/+$/, "")}/product/${product.slug}/`;
  return [
    `Здравствуйте! Интересует «${product.title}»`,
    price ? `Цена на сайте: ${price}` : "",
    url,
  ]
    .filter(Boolean)
    .join("\n");
}

export function fitCheckMessage(site: Site, product: { title: string; slug: string }): string {
  const url = `${site.url.replace(/\/+$/, "")}/product/${product.slug}/`;
  return [`Здравствуйте! Подойдёт ли «${product.title}» на мою машину?`, "VIN: ", url].join("\n");
}
