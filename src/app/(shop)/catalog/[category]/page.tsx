import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { CategoryView, categoryMetadata } from "@/components/CategoryView";
import { getCategoryBySlug, getRootCategories } from "@/lib/catalog";
import { readListing, type ListingParams } from "@/lib/listing";
import { findRedirect } from "@/lib/redirects";

/**
 * Раздел верхнего уровня — основная точка входа из поиска.
 *
 * Подразделы сюда не попадают: у них свой адрес, /catalog/родитель/раздел/.
 * Если открыть подраздел по короткому адресу, страница отдаёт 404, а не
 * дубль — иначе один и тот же товарный список был бы доступен по двум
 * адресам, и поисковик сам решал бы, какой из них показывать.
 */

export function generateStaticParams() {
  return getRootCategories().map((category) => ({ category: category.slug }));
}

interface PageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<ListingParams>;
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { category: slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category || category.parentId) return {};
  return categoryMetadata(category, readListing(await searchParams));
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { category: slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category || category.parentId) {
    // Раздел мог переехать — переименование меняет адрес. Со старого адреса
    // отдаём постоянную переадресацию, а не 404.
    const target = findRedirect(`/catalog/${slug}/`);
    if (target) permanentRedirect(target);
    notFound();
  }

  return <CategoryView category={category} listing={readListing(await searchParams)} />;
}
