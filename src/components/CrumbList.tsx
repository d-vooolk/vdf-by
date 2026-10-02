import Link from "next/link";

import { ChevronRightIcon } from "@/components/icons";

export interface Crumb {
  label: string;
  href?: string;
}

export function CrumbList({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Хлебные крошки" className="py-4">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-brand-400">
        {trail.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
            {index > 0 && <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-brand-300" />}
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
  );
}
