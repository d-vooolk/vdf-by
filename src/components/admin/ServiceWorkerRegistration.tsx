"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin/" }).catch(() => undefined);
  }, []);
  return null;
}
