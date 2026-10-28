"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { rememberListLocation } from "@/lib/admin-list-memory";

export function ListMemory() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const location = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    rememberListLocation();
  }, [location]);

  useEffect(() => {
    const onLeave = () => rememberListLocation();
    document.addEventListener("click", onLeave, true);
    window.addEventListener("pagehide", onLeave);
    return () => {
      document.removeEventListener("click", onLeave, true);
      window.removeEventListener("pagehide", onLeave);
    };
  }, []);

  return null;
}
