"use client";

import { useLayoutEffect } from "react";

import type { AdminTheme } from "@/lib/admin-prefs";

export function AdminRootTheme({ theme }: { theme: AdminTheme }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.adminTheme = theme;
    return () => {
      delete root.dataset.adminTheme;
    };
  }, [theme]);

  return null;
}
