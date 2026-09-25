import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import {
  CategoryMarkView,
  categoryMarkMetadata,
} from "@/components/CategoryCarView";
import { CategoryView, categoryMetadata } from "@/components/CategoryView";
import { markParams, resolveMark } from "@/lib/car-branch";
import { getCategories, getCategoryById, getCategoryBySlug } from "@/lib/catalog";
import { readListing, type ListingParams } from "@/lib/listing";
import { findRedirect } from "@/lib/redirects";

/**
 * Подраздел: /catalog/aksessuary/maski/.
 *
 * Slug раздела уникален на весь сайт, так что найти подраздел можно и по
 * одному только второму сегменту. Родителя всё равно проверяем: без этого
 * /catalog/lampy/maski/ отдавал бы ту же страницу, что и
 * /catalog/aksessuary/maski/, — сколько разделов, столько и дублей.
 */

export function generateStaticParams() {
  const subs = getCategories()
    .filter((category) => category.parentId)
    .map((category) => ({
      category: getCategoryById(category.parentId!)?.slug ?? "",
      branch: category.slug,
    }))
    .filter((params) => params.category);

  return [...subs, ...markParams()];
}

interface PageProps {
  params: Promise<{ category: string; branch: string }>;
  searchParams: Promise<ListingParams>;
}

/** Подраздел вместе с проверкой, что он лежит именно в этом родителе. */
function resolveSub(parentSlug: string, slug: string) {
  const category = getCategoryBySlug(slug);
  if (!category?.parentId) return undefined;
  const parent = getCategoryById(category.parentId);
  return parent?.slug === parentSlug ? category : undefined;
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { category: parentSlug, branch } = await params;

  const sub = resolveSub(parentSlug, branch);
  if (sub) return categoryMetadata(sub, readListing(await searchParams));

  const mark = resolveMark(parentSlug, branch);
  return mark ? categoryMarkMetadata(mark) : {};
}

export default async function CategoryBranchPage({ params, searchParams }: PageProps) {
  const { category: parentSlug, branch } = await params;

  const sub = resolveSub(parentSlug, branch);
  if (sub) return <CategoryView category={sub} listing={readListing(await searchParams)} />;

  const mark = resolveMark(parentSlug, branch);
  if (mark) return <CategoryMarkView {...mark} />;

  // Переименовали родителя или сам подраздел — адрес поменялся целиком.
  const target = findRedirect(`/catalog/${parentSlug}/${branch}/`);
  if (target) permanentRedirect(target);
  notFound();
}
