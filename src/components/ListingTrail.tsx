"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { CrumbList, type Crumb } from "@/components/CrumbList";

const STORAGE_KEY = "vdf_listing_trail";

interface StoredListing {
  href: string;
  trail: Crumb[];
  slugs: string[];
}

function readStored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseStored(value: string | null): StoredListing | null {
  if (!value) return null;
  try {
    const listing = JSON.parse(value) as StoredListing;
    return Array.isArray(listing.trail) && Array.isArray(listing.slugs) ? listing : null;
  } catch {
    return null;
  }
}

function withoutSlash(path: string): string {
  return path.replace(/\/+$/, "");
}

const subscribe = () => () => {};

export function RememberListing(listing: StoredListing) {
  const serialized = JSON.stringify(listing);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, serialized);
    } catch {}
  }, [serialized]);

  return null;
}

export function ListingTrailKeeper() {
  const pathname = usePathname();

  useEffect(() => {
    const listing = parseStored(readStored());
    if (!listing) return;
    const path = withoutSlash(window.location.pathname);
    const product = path.match(/^\/product\/([^/]+)$/)?.[1];
    const keep =
      path === withoutSlash(listing.href) ||
      (product !== undefined && listing.slugs.includes(decodeURIComponent(product)));
    if (keep) return;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, [pathname]);

  return null;
}

export function ListingCrumbs({ fallback, slug, title }: { fallback: Crumb[]; slug: string; title: string }) {
  const stored = useSyncExternalStore(subscribe, readStored, () => null);

  const trail = useMemo(() => {
    const listing = parseStored(stored);
    if (!listing?.slugs.includes(slug)) return fallback;
    return [...listing.trail, { label: title }];
  }, [stored, fallback, slug, title]);

  return <CrumbList trail={trail} />;
}
