import Link from "next/link";

import { categoryUrl, getRootCategories, getSite } from "@/lib/catalog";

export default function ShopNotFound() {
  const site = getSite();
  const categories = getRootCategories();

  return (
    <div className="container-page py-16 sm:py-24">
      <div className="mx-auto max-w-lg text-center">
        <p className="text-5xl font-semibold text-brand-700">404</p>
        <h1 className="mt-4 text-3xl font-semibold text-brand-900">
          Страница не найдена
        </h1>
        <p className="mt-3 text-base text-brand-500">
          Возможно, товар снят с продажи или в адресе опечатка. Посмотрите
          каталог или позвоните — подскажем аналог.
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/catalog/" className="btn-primary">
            В каталог
          </Link>
          <a href={`tel:${site.phoneHref}`} className="btn-secondary">
            {site.phone}
          </a>
        </div>

        <nav className="mt-10" aria-label="Разделы каталога">
          <p className="mb-3 text-sm font-semibold text-brand-900">
            Разделы магазина
          </p>
          <ul className="flex flex-wrap justify-center gap-2">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={categoryUrl(category)}
                  className="inline-flex rounded-xl border border-brand-200 bg-white px-3.5 py-2 text-sm text-brand-800 hover:border-brand-600 hover:text-brand-700"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
