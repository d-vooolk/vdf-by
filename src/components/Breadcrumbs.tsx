import Link from "next/link";

import { ChevronRightIcon } from "@/components/icons";
import { getSite } from "@/lib/catalog";

/**
 * Хлебные крошки. Помимо навигации отдают Google разметку BreadcrumbList —
 * с ней в выдаче вместо голого URL показывается путь «VDF.BY › Лампы ›
 * Osram Night Breaker».
 */

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const site = getSite();
  const trail: Crumb[] = [{ label: "Главная", href: "/" }, ...items];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      // Последний элемент — текущая страница, у него item не указывается.
      ...(crumb.href ? { item: `${site.url}${crumb.href}` } : {}),
    })),
  };

  return (
    <>
      <nav aria-label="Хлебные крошки" className="py-4">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-brand-400">
          {trail.map((crumb, index) => (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-brand-300" />
              )}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-brand-700">
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-medium text-brand-600">{crumb.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
