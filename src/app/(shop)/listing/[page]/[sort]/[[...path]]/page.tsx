import type { Metadata } from "next";
import { permanentRedirect, redirect } from "next/navigation";

import { CATALOG_PATH, CatalogView, catalogMetadata } from "@/components/CatalogView";
import { CategoryView, categoryMetadata, collectionMetadata } from "@/components/CategoryView";
import {
  categoryUrl,
  collectionUrl,
  getCategoryBySlug,
  getProducts,
  getProductsInCategory,
  getProductsInCollection,
  resolveCollection,
  resolveSubcategory,
} from "@/lib/catalog";
import {
  isSortKey,
  listingHref,
  pageCount,
  type ListingState,
} from "@/lib/listing";
import type { Category, CategoryCollection } from "@/lib/schema";

export function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ page: string; sort: string; path?: string[] }>;
}

interface Scope {
  category: Category | null;
  collection?: CategoryCollection;
  basePath: string;
  total: number;
}

function resolveScope(path: string[]): Scope | null {
  if (path.length === 0) {
    return { category: null, basePath: CATALOG_PATH, total: getProducts().length };
  }
  const found =
    path.length === 2 && !resolveSubcategory(path[0], path[1]) ? resolveCollection(path[0], path[1]) : undefined;
  if (found) {
    return {
      category: found.category,
      collection: found.collection,
      basePath: collectionUrl(found.category, found.collection),
      total: getProductsInCollection(found.category, found.collection).length,
    };
  }
  const category =
    path.length === 1
      ? getCategoryBySlug(path[0])
      : path.length === 2
        ? resolveSubcategory(path[0], path[1])
        : undefined;
  if (!category || (path.length === 1 && category.parentId)) return null;
  return {
    category,
    basePath: categoryUrl(category),
    total: getProductsInCategory(category.id).length,
  };
}

async function resolve(props: PageProps): Promise<{ scope: Scope; listing: ListingState }> {
  const { page: rawPage, sort: rawSort, path = [] } = await props.params;
  const scope = resolveScope(path);
  if (!scope) permanentRedirect(path.length ? `/catalog/${path.join("/")}/` : CATALOG_PATH);

  const sort = isSortKey(rawSort) ? rawSort : "default";
  const page = Math.floor(Number(rawPage));
  const pages = pageCount(scope.total);

  if (!Number.isFinite(page) || page < 1) permanentRedirect(listingHref(scope.basePath, 1, sort));
  if (page > pages) redirect(listingHref(scope.basePath, pages, sort));
  if (page === 1 && sort === "default") permanentRedirect(scope.basePath);

  return { scope, listing: { page, sort } };
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { scope, listing } = await resolve(props);
  if (scope.category && scope.collection) return collectionMetadata(scope.category, scope.collection, listing);
  return scope.category ? categoryMetadata(scope.category, listing) : catalogMetadata(listing);
}

export default async function ListingPage(props: PageProps) {
  const { scope, listing } = await resolve(props);
  return scope.category ? (
    <CategoryView category={scope.category} collection={scope.collection} listing={listing} />
  ) : (
    <CatalogView listing={listing} />
  );
}
