import Link from "next/link";

import { getSite } from "@/lib/catalog";

/**
 * 404 для адресов, не совпавших ни с одним маршрутом.
 *
 * Лежит в корне app/, а не в группе (shop) — иначе Next не считал бы её общей
 * страницей «не найдено». Шапки и подвала здесь нет: разметка этой страницы
 * уезжает в данные каждой страницы сайта.
 */
export default function NotFound() {
  const site = getSite();

  return (
    <main id="main" className="container-page flex min-h-dvh flex-col items-center justify-center py-16 text-center">
      <Link href="/" aria-label={`${site.name} — на главную`}>
        <img src="/brand/logo.png" alt={site.name} width={600} height={100} className="h-7 w-auto" />
      </Link>
      <p className="mt-10 text-5xl font-semibold text-brand-700">404</p>
      <h1 className="mt-4 text-3xl font-semibold text-brand-900">Страница не найдена</h1>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/catalog/" className="btn-primary">
          В каталог
        </Link>
        <a href={`tel:${site.phoneHref}`} className="btn-secondary">
          {site.phone}
        </a>
      </div>
    </main>
  );
}
