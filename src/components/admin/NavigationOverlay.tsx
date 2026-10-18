"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { SpinnerIcon } from "@/components/icons";

export const NAVIGATION_START_EVENT = "admin:navigation-start";
export const NAVIGATION_END_EVENT = "admin:navigation-end";

const STUCK_TIMEOUT_MS = 30000;

export function startNavigationOverlay(): void {
  window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
}

export function stopNavigationOverlay(): void {
  window.dispatchEvent(new Event(NAVIGATION_END_EVENT));
}

function isInternalNavigation(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/admin")) return false;
  if (url.pathname.startsWith("/admin/api/")) return false;
  return url.pathname + url.search !== window.location.pathname + window.location.search;
}

export function NavigationOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const location = `${pathname}?${searchParams.toString()}`;
  const [pending, setPending] = useState(false);
  const [shownFor, setShownFor] = useState(location);

  if (shownFor !== location) {
    setShownFor(location);
    setPending(false);
  }

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (isInternalNavigation(event)) setPending(true);
    };
    const start = () => setPending(true);
    const stop = () => setPending(false);
    document.addEventListener("click", onClick);
    window.addEventListener(NAVIGATION_START_EVENT, start);
    window.addEventListener(NAVIGATION_END_EVENT, stop);
    window.addEventListener("popstate", stop);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener(NAVIGATION_START_EVENT, start);
      window.removeEventListener(NAVIGATION_END_EVENT, stop);
      window.removeEventListener("popstate", stop);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(false), STUCK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  if (!pending) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex cursor-wait items-center justify-center bg-black/35 backdrop-blur-[2px]"
    >
      <span className="flex items-center gap-3 rounded-2xl bg-white px-5 py-3 text-sm font-medium text-brand-800 shadow-pop">
        <SpinnerIcon className="h-5 w-5 animate-spin" />
        Загрузка…
      </span>
    </div>
  );
}
