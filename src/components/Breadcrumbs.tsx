import { CrumbList, type Crumb } from "@/components/CrumbList";
import { JsonLd } from "@/components/JsonLd";
import { ListingCrumbs, RememberListing } from "@/components/ListingTrail";
import { absoluteUrl } from "@/lib/seo";

/**
 * Хлебные крошки. Помимо навигации отдают Google разметку BreadcrumbList —
 * с ней в выдаче вместо голого URL показывается путь «VDF.BY › Лампы ›
 * Osram Night Breaker».
 */

export type { Crumb };

interface BreadcrumbsProps {
  items: Crumb[];
  rememberListing?: { href: string; slugs: string[] };
  listingProduct?: string;
}

export function Breadcrumbs({ items, rememberListing, listingProduct }: BreadcrumbsProps) {
  const trail: Crumb[] = [{ label: "Главная", href: "/" }, ...items];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      // Последний элемент — текущая страница, у него item не указывается.
      ...(crumb.href ? { item: absoluteUrl(crumb.href) } : {}),
    })),
  };

  const current = trail[trail.length - 1];

  return (
    <>
      {listingProduct ? (
        <ListingCrumbs fallback={trail} slug={listingProduct} title={current.label} />
      ) : (
        <CrumbList trail={trail} />
      )}
      {rememberListing && (
        <RememberListing
          href={rememberListing.href}
          trail={[...trail.slice(0, -1), { label: current.label, href: rememberListing.href }]}
          slugs={rememberListing.slugs}
        />
      )}
      <JsonLd data={jsonLd} />
    </>
  );
}
