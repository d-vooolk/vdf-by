import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { getSite } from "@/lib/catalog";

import "./globals.css";

/**
 * Корневой макет: только каркас документа, шрифт и общие мета-теги.
 *
 * Шапки и подвала магазина здесь намеренно нет — они переехали в макет
 * витрины, src/app/(shop)/layout.tsx. Причина простая: админка живёт в том же
 * приложении, и меню каталога с корзиной ей ни к чему. Группа (shop) на
 * адреса не влияет: /catalog/ так и остался /catalog/.
 */

/**
 * Шрифт скачивается на сборке и раздаётся с нашего домена: нет запроса к
 * fonts.googleapis.com, нет лишнего DNS-резолва и TLS-хендшейка перед
 * отрисовкой текста. display: swap — текст видно сразу системным шрифтом.
 */
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-inter",
  // Метрики системного шрифта подгоняются под Inter, чтобы при подмене
  // текст не «прыгал» — это убирает CLS от загрузки шрифта.
  adjustFontFallback: true,
});

const site = getSite();

export const metadata: Metadata = {
  // База для canonical и og:image — без неё Next оставит относительные пути,
  // а соцсети и краулеры их не поймут.
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline.toLowerCase()} в Минске`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.legalName }],
  keywords: [
    "автосвет",
    "линзы для фар",
    "би-лед линзы",
    "стёкла фар",
    "автомобильные лампы",
    "блоки розжига",
    "Минск",
    "Беларусь",
  ],
  formatDetection: { telephone: true },
  openGraph: {
    type: "website",
    siteName: site.name,
    locale: site.locale,
    url: site.url,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1020",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={inter.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
