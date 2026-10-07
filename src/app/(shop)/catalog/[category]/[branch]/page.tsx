import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import {
  CategoryMarkView,
  categoryMarkMetadata,
} from "@/components/CategoryCarView";
import { CategoryView, categoryMetadata, collectionMetadata } from "@/components/CategoryView";
import { markParams, resolveMark } from "@/lib/car-branch";
import {
  categoryCollections,
  getCategories,
  getCategoryById,
  resolveCollection,
  resolveSubcategory,
} from "@/lib/catalog";
import { FIRST_PAGE } from "@/lib/listing";
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

  const collections = getCategories().flatMap((category) =>
    categoryCollections(category).map((collection) => ({ category: category.slug, branch: collection.slug })),
  );

  return [...subs, ...collections, ...markParams()];
}

interface PageProps {
  params: Promise<{ category: string; branch: string }>;
}


export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { category: parentSlug, branch } = await params;

  const sub = resolveSubcategory(parentSlug, branch);
  if (sub) return categoryMetadata(sub, FIRST_PAGE);

  const found = resolveCollection(parentSlug, branch);
  if (found) return collectionMetadata(found.category, found.collection, FIRST_PAGE);

  const mark = resolveMark(parentSlug, branch);
  return mark ? categoryMarkMetadata(mark) : {};
}

export default async function CategoryBranchPage({ params }: PageProps) {
  const { category: parentSlug, branch } = await params;

  const sub = resolveSubcategory(parentSlug, branch);
  if (sub) return <CategoryView category={sub} listing={FIRST_PAGE} />;

  const found = resolveCollection(parentSlug, branch);
  if (found) return <CategoryView category={found.category} collection={found.collection} listing={FIRST_PAGE} />;

  const mark = resolveMark(parentSlug, branch);
  if (mark) return <CategoryMarkView {...mark} />;

  // Переименовали родителя или сам подраздел — адрес поменялся целиком.
  const target = findRedirect(`/catalog/${parentSlug}/${branch}/`);
  if (target) permanentRedirect(target);
  notFound();
}
