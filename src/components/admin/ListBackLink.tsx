"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { rememberedListUrl, subscribeListMemory } from "@/lib/admin-list-memory";

export function useListBackHref(fallback: string, sources: string[] = [fallback]): string {
  const remembered = useSyncExternalStore(
    subscribeListMemory,
    () => rememberedListUrl(sources),
    () => null,
  );
  return remembered ?? fallback;
}

export function ListBackLink({
  fallback,
  sources,
  children,
  className = "btn-ghost py-2 text-sm",
}: {
  fallback: string;
  sources?: string[];
  children: React.ReactNode;
  className?: string;
}) {
  const href = useListBackHref(fallback, sources);
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
