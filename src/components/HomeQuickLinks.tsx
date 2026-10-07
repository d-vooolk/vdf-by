import Link from "next/link";

import { carsRoot, markUrl } from "@/lib/car-types";
import { getCarTree } from "@/lib/cars";
import { categoryCollections, categoryUrl, collectionUrl, getCategoryById } from "@/lib/catalog";

const QUICK_CATEGORIES = ["glasses", "bi-led-moduli", "svetovody", "korpusa-far"];
const MARKS_SHOWN = 12;

interface QuickGroup {
  title: string;
  href: string;
  links: Array<{ label: string; href: string }>;
}

function quickGroups(): QuickGroup[] {
  return QUICK_CATEGORIES.flatMap((id) => {
    const category = getCategoryById(id);
    if (!category) return [];
    const links = category.carFitment
      ? getCarTree(category.id)
          .filter((mark) => mark.productCount > 0)
          .sort((a, b) => b.productCount - a.productCount)
          .slice(0, MARKS_SHOWN)
          .map((mark) => ({ label: mark.name, href: markUrl(mark.slug, carsRoot(category.slug)) }))
      : categoryCollections(category).map((collection) => ({
          label: collection.label ?? collection.name,
          href: collectionUrl(category, collection),
        }));
    return [{ title: category.name, href: categoryUrl(category), links }];
  });
}

export function HomeQuickLinks() {
  const groups = quickGroups();
  if (!groups.length) return null;
  return (
    <section className="container-page pb-16" aria-labelledby="quick-links">
      <h2 id="quick-links" className="mb-6 text-2xl font-semibold text-brand-900">
        Быстрый переход
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.href} className="rounded-card border border-brand-100 p-5">
            <h3 className="mb-3 text-base font-semibold">
              <Link href={group.href} className="text-brand-900 hover:text-brand-700">
                {group.title}
              </Link>
            </h3>
            {group.links.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-block rounded-full border border-brand-200 px-3 py-1 text-sm text-brand-700 hover:border-brand-400"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
