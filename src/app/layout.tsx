import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/lora/wght.css";

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
  formatDetection: { telephone: true },
  openGraph: {
    type: "website",
    siteName: site.name,
    locale: site.locale,
    url: site.url,
  },
};

export const viewport: Viewport = {
  themeColor: "#1e362d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-scroll-behavior="smooth">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
