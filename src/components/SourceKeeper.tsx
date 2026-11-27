"use client";

import { useEffect } from "react";

import { SOURCE_COOKIE, SOURCE_MAX_AGE } from "@/lib/order-source";

function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

function externalSource(): string | null {
  const utm = new URLSearchParams(window.location.search).get("utm_source");
  if (utm) return `utm:${utm}`;
  if (!document.referrer) return null;
  try {
    const host = bareHost(new URL(document.referrer).hostname);
    return host && host !== bareHost(window.location.hostname) ? host : null;
  } catch {
    return null;
  }
}

export function SourceKeeper() {
  useEffect(() => {
    const source = externalSource();
    if (!source) return;
    document.cookie = `${SOURCE_COOKIE}=${encodeURIComponent(source.slice(0, 100))}; path=/; max-age=${SOURCE_MAX_AGE}; samesite=lax`;
  }, []);
  return null;
}
